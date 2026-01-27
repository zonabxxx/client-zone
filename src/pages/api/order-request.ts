import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/session';
import { getClient } from '../../lib/db';

// API URL of the main business-flow-ai application
// Auto-detect local development
const isLocal = process.env.NODE_ENV !== 'production';
const envApiUrl = import.meta.env.BUSINESS_FLOW_API_URL;
const API_BASE_URL = (envApiUrl && envApiUrl.trim()) ? envApiUrl : (isLocal ? 'http://localhost:3000' : 'https://business-flow-ai.up.railway.app');
const API_KEY = import.meta.env.BUSINESS_FLOW_API_KEY || '';

// EAV Table ID for projects (same as in db.ts)
const PROJECTS_TABLE_ID = '65d05590-1c20-4d88-8e82-bfcbf9b9e23f';

interface CartItem {
  id: string;
  name: string;
  description?: string;
  basePrice: number;
  quantity: number;
  deliveryDays?: number;
  categoryId?: string;
  parameters?: Array<{
    id: string;
    parameterName: string;
    displayName: string;
    value: string;
    priceModifier?: number;
  }>;
}

interface OrderRequestBody {
  items: CartItem[];
  projectName?: string;
  note?: string;
}

// Generate project number
function generateProjectNumber(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `PP-${year}${month}${day}-${random}`;
}

// Create or find project for the client via direct EAV
async function getOrCreateProject(
  clientEntityId: string, 
  clientName: string, 
  projectName: string
): Promise<{ id: string; entityId: string }> {
  const db = getClient();
  
  // First try to find existing "Dopyty z portálu" project for this client
  const existingResult = await db.execute({
    sql: `
      SELECT DISTINCT e.id as entityId, a2.string_value as projectId
      FROM entities e
      JOIN attributes a1 ON e.id = a1.entity_id
      JOIN attributes a2 ON e.id = a2.entity_id
      WHERE e.table_id = ?
        AND a1.attribute_name = 'clientEntityId' AND a1.string_value = ?
        AND a2.attribute_name = 'id'
      ORDER BY e.created_at DESC
      LIMIT 1
    `,
    args: [PROJECTS_TABLE_ID, clientEntityId]
  });
  
  if (existingResult.rows.length > 0) {
    return {
      id: existingResult.rows[0].projectId as string,
      entityId: existingResult.rows[0].entityId as string,
    };
  }
  
  // Create new project
  const projectId = crypto.randomUUID();
  const entityId = crypto.randomUUID();
  const projectNumber = generateProjectNumber();
  const now = Math.floor(Date.now() / 1000);
  
  // Create entity
  await db.execute({
    sql: `INSERT INTO entities (id, table_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    args: [entityId, PROJECTS_TABLE_ID, now, now]
  });
  
  // Create attributes for the project
  const attributes = [
    { name: 'id', type: 'string', value: projectId },
    { name: 'name', type: 'string', value: projectName },
    { name: 'projectNumber', type: 'string', value: projectNumber },
    { name: 'companyName', type: 'string', value: clientName },
    { name: 'clientEntityId', type: 'string', value: clientEntityId },
    { name: 'status', type: 'string', value: 'active' },
    { name: 'source', type: 'string', value: 'client-portal' },
    { name: 'createdAt', type: 'string', value: new Date().toISOString() },
    { name: 'updatedAt', type: 'string', value: new Date().toISOString() },
  ];
  
  for (const attr of attributes) {
    const attrId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO attributes (id, entity_id, attribute_name, value_type, string_value, created_at) 
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [attrId, entityId, attr.name, attr.type, attr.value, now]
    });
  }
  
  console.log('[ORDER-REQUEST] Created project:', projectId);
  return { id: projectId, entityId };
}

export const POST: APIRoute = async ({ request }) => {
  // Check authentication
  const session = getSessionFromCookie(request.headers.get('cookie'));
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const body = await request.json() as OrderRequestBody;
    const { items, projectName, note } = body;

    if (!items || items.length === 0) {
      return new Response(JSON.stringify({ error: 'No items in cart' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Create or find project for the client
    const finalProjectName = projectName || `Dopyt z portálu - ${new Date().toLocaleDateString('sk-SK')}`;
    const project = await getOrCreateProject(
      session.customerId, 
      session.customerName, 
      finalProjectName
    );

    // Step 2: Build products array for calculation
    const products = items.map((item) => {
      // Calculate total price including parameter modifiers
      let totalPriceModifier = 0;
      const selectedParameters: Record<string, string> = {};
      
      if (item.parameters) {
        item.parameters.forEach(param => {
          selectedParameters[param.parameterName] = param.value;
          if (param.priceModifier) {
            totalPriceModifier += param.priceModifier;
          }
        });
      }

      const unitPrice = item.basePrice + totalPriceModifier;
      const totalCost = unitPrice * item.quantity;

      return {
        id: item.id,
        productId: item.id,
        name: item.name,
        product: {
          id: item.id,
          name: item.name,
          categoryId: item.categoryId,
        },
        variant: {
          name: item.name,
          unit: 'ks',
        },
        quantity: item.quantity,
        calculatedQuantity: item.quantity,
        totalCost,
        salePrice: unitPrice,
        finalPrice: totalCost,
        deliveryDays: item.deliveryDays,
        customFieldValues: selectedParameters,
        calculatorInputValues: selectedParameters,
      };
    });

    // Calculate totals
    const totalPrice = products.reduce((sum, p) => sum + p.totalCost, 0);

    // Step 3: Create calculation with products
    const calculationData = {
      products,
      services: [],
      materials: [],
      customVariables: [],
      actualTotalPrice: totalPrice,
      totalCost: totalPrice,
      selectedClient: {
        entityId: session.customerId,
        name: session.customerName,
        email: session.email,
      },
      customerNote: note,
      source: 'client-portal',
    };

    const calculationResponse = await fetch(
      `${API_BASE_URL}/api/public/v1/calculations?organizationId=${session.organizationId}`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName || `Dopyt - ${items.map(i => i.name).join(', ').substring(0, 50)}`,
          description: note || `Dopyt z klientského portálu obsahujúci ${items.length} produktov`,
          projectId: project.id,
          calculationData,
          calculationDataKeys: ['products', 'services', 'materials', 'customVariables', 'actualTotalPrice'],
        }),
      }
    );

    if (!calculationResponse.ok) {
      const errorText = await calculationResponse.text();
      console.error('[ORDER-REQUEST] Failed to create calculation:', calculationResponse.status, errorText);
      return new Response(JSON.stringify({ error: 'Failed to create calculation' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const calculation = await calculationResponse.json();
    console.log('[ORDER-REQUEST] Created calculation:', calculation.id);

    return new Response(JSON.stringify({
      success: true,
      projectId: project.id,
      calculationId: calculation.id,
      message: 'Dopyt bol úspešne odoslaný. Budeme vás kontaktovať s cenovou ponukou.',
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[ORDER-REQUEST] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
