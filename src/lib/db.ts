import { createClient, type Client } from '@libsql/client';

// Database connection configuration
// Priority: 1. DB_URL env var (Turso cloud), 2. Local file fallback
const DB_URL = import.meta.env.DB_URL || process.env.DB_URL;
const DB_TOKEN = import.meta.env.DB_TOKEN || process.env.DB_TOKEN;

let client: Client | null = null;
let connectionError: string | null = null;

function getClient(): Client {
  if (client) return client;
  
  if (!DB_URL) {
    connectionError = 'DB_URL nie je nastavená. Pridajte DB_URL a DB_TOKEN do .env súboru.';
    throw new Error(connectionError);
  }
  
  try {
    client = createClient({
      url: DB_URL,
      authToken: DB_TOKEN,
    });
    return client;
  } catch (error) {
    connectionError = `Nepodarilo sa pripojiť k databáze: ${error}`;
    throw new Error(connectionError);
  }
}

// Types for our queries
export interface Customer {
  id: string;
  name: string;
  email: string | null;
  contactEmail: string | null;
  businessName: string | null;
  phone: string | null;
  organizationId: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  name: string;
  status: 'DRAFT' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  priority: 'low' | 'medium' | 'high' | 'critical';
  clientName: string | null;
  clientEntityId: string | null;
  calculationId: string | null;
  totalValue: number | null;
  servicesCount: number | null;
  startDate: Date | null;
  plannedEndDate: Date | null;
  actualEndDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderService {
  id: string;
  orderId: string;
  serviceName: string;
  departmentName: string;
  serviceCategory: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  quantity: number;
  unit: string | null;
  basePrice: number | null;
  salePrice: number | null;
  totalPrice: number | null;
}

export interface OrderTask {
  id: string;
  orderId: string;
  serviceId: string;
  departmentName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  estimatedDuration: number | null;
}

// Project type for client portal
export interface Project {
  id: string;
  entityId: string;
  name: string;
  projectNumber: string;
  companyName: string;
  clientEntityId: string;
  totalPrice: number;
  calculationsCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Calculation type for client portal
export interface Calculation {
  id: string;
  entityId: string;
  name: string;
  calculationNumber: string;
  description: string | null;
  status: string;
  approvalStatus: 'DRAFT' | 'CLIENT_VIEWED' | 'CLIENT_APPROVED' | 'CLIENT_REJECTED' | 'CLIENT_REQUESTED_CHANGES';
  projectId: string | null;
  clientEntityId: string | null;
  totalPrice: number | null;
  shareToken: string | null;
  shareExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderTask {
  id: string;
  orderId: string;
  serviceId: string;
  departmentName: string;
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  estimatedDuration: number | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

// Find customer by email
export async function findCustomerByEmail(email: string): Promise<Customer | null> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT id, name, email, contact_email as contactEmail, business_name as businessName, 
               phone, organization_id as organizationId
        FROM customers 
        WHERE LOWER(email) = LOWER(?) OR LOWER(contact_email) = LOWER(?)
        LIMIT 1
      `,
      args: [email, email]
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string | null,
      contactEmail: row.contactEmail as string | null,
      businessName: row.businessName as string | null,
      phone: row.phone as string | null,
      organizationId: row.organizationId as string,
    };
  } catch (error) {
    console.error('Error finding customer:', error);
    throw error;
  }
}

// Get customer orders
export async function getCustomerOrders(customerId: string, customerName: string): Promise<Order[]> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT 
          id, order_number as orderNumber, name, status, priority,
          client_name as clientName, client_entity_id as clientEntityId,
          total_value as totalValue, services_count as servicesCount,
          start_date as startDate, planned_end_date as plannedEndDate,
          actual_end_date as actualEndDate,
          created_at as createdAt, updated_at as updatedAt
        FROM orders_v2 
        WHERE client_entity_id = ? OR LOWER(client_name) LIKE LOWER(?)
        ORDER BY created_at DESC
      `,
      args: [customerId, `%${customerName}%`]
    });
    
    return result.rows.map(row => ({
      id: row.id as string,
      orderNumber: row.orderNumber as string,
      name: row.name as string,
      status: row.status as Order['status'],
      priority: row.priority as Order['priority'],
      clientName: row.clientName as string | null,
      clientEntityId: row.clientEntityId as string | null,
      totalValue: row.totalValue as number | null,
      servicesCount: row.servicesCount as number | null,
      // SQLite timestamps are in seconds, JS Date expects milliseconds
      startDate: row.startDate ? new Date((row.startDate as number) * 1000) : null,
      plannedEndDate: row.plannedEndDate ? new Date((row.plannedEndDate as number) * 1000) : null,
      actualEndDate: row.actualEndDate ? new Date((row.actualEndDate as number) * 1000) : null,
      createdAt: new Date((row.createdAt as number) * 1000),
      updatedAt: new Date((row.updatedAt as number) * 1000),
    }));
  } catch (error) {
    console.error('Error getting customer orders:', error);
    return [];
  }
}

// Get order by ID
export async function getOrderById(orderId: string): Promise<Order | null> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT 
          id, order_number as orderNumber, name, status, priority,
          client_name as clientName, client_entity_id as clientEntityId,
          calculation_id as calculationId,
          total_value as totalValue, services_count as servicesCount,
          start_date as startDate, planned_end_date as plannedEndDate,
          actual_end_date as actualEndDate,
          created_at as createdAt, updated_at as updatedAt
        FROM orders_v2 
        WHERE id = ?
        LIMIT 1
      `,
      args: [orderId]
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id as string,
      orderNumber: row.orderNumber as string,
      name: row.name as string,
      status: row.status as Order['status'],
      priority: row.priority as Order['priority'],
      clientName: row.clientName as string | null,
      clientEntityId: row.clientEntityId as string | null,
      calculationId: row.calculationId as string | null,
      totalValue: row.totalValue as number | null,
      servicesCount: row.servicesCount as number | null,
      // SQLite timestamps are in seconds, JS Date expects milliseconds
      startDate: row.startDate ? new Date((row.startDate as number) * 1000) : null,
      plannedEndDate: row.plannedEndDate ? new Date((row.plannedEndDate as number) * 1000) : null,
      actualEndDate: row.actualEndDate ? new Date((row.actualEndDate as number) * 1000) : null,
      createdAt: new Date((row.createdAt as number) * 1000),
      updatedAt: new Date((row.updatedAt as number) * 1000),
    };
  } catch (error) {
    console.error('Error getting order:', error);
    return null;
  }
}

// Get order services with real status from tasks
export async function getOrderServices(orderId: string): Promise<OrderService[]> {
  try {
    const db = getClient();
    
    // Get services with full details
    const servicesResult = await db.execute({
      sql: `
        SELECT 
          id, order_id as orderId, service_name as serviceName,
          department_name as departmentName, service_category as serviceCategory,
          status, quantity, unit, 
          base_price as basePrice, sale_price as salePrice, total_price as totalPrice
        FROM order_services 
        WHERE order_id = ?
        ORDER BY sequence ASC, created_at ASC
      `,
      args: [orderId]
    });
    
    // Get tasks to determine real service status
    const tasksResult = await db.execute({
      sql: `
        SELECT service_id, status
        FROM order_tasks_v2 
        WHERE order_id = ?
      `,
      args: [orderId]
    });
    
    // Group tasks by service_id
    const tasksByService = new Map<string, string[]>();
    for (const task of tasksResult.rows) {
      const serviceId = task.service_id as string;
      const status = task.status as string;
      if (!tasksByService.has(serviceId)) {
        tasksByService.set(serviceId, []);
      }
      tasksByService.get(serviceId)!.push(status);
    }
    
    // Calculate real status for each service based on its tasks
    function getRealStatus(serviceId: string, originalStatus: string): OrderService['status'] {
      const taskStatuses = tasksByService.get(serviceId);
      if (!taskStatuses || taskStatuses.length === 0) {
        return originalStatus as OrderService['status'];
      }
      
      // All completed = completed
      if (taskStatuses.every(s => s === 'completed')) {
        return 'completed';
      }
      // Any in_progress = in_progress
      if (taskStatuses.some(s => s === 'in_progress')) {
        return 'in_progress';
      }
      // Any completed but not all = in_progress
      if (taskStatuses.some(s => s === 'completed')) {
        return 'in_progress';
      }
      // All blocked or pending = pending
      return 'pending';
    }
    
    return servicesResult.rows.map(row => ({
      id: row.id as string,
      orderId: row.orderId as string,
      serviceName: row.serviceName as string,
      departmentName: row.departmentName as string,
      serviceCategory: row.serviceCategory as string | null,
      status: getRealStatus(row.id as string, row.status as string),
      quantity: row.quantity as number,
      unit: row.unit as string | null,
      basePrice: row.basePrice as number | null,
      salePrice: row.salePrice as number | null,
      totalPrice: row.totalPrice as number | null,
    }));
  } catch (error) {
    console.error('Error getting order services:', error);
    return [];
  }
}

// Get order tasks for progress tracking
export async function getOrderTasks(orderId: string): Promise<OrderTask[]> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT 
          id, order_id as orderId, service_id as serviceId,
          department_name as departmentName, status,
          estimated_duration as estimatedDuration,
          started_at as startedAt, completed_at as completedAt
        FROM order_tasks_v2 
        WHERE order_id = ?
        ORDER BY sequence ASC, created_at ASC
      `,
      args: [orderId]
    });
    
    return result.rows.map(row => ({
      id: row.id as string,
      orderId: row.orderId as string,
      serviceId: row.serviceId as string,
      departmentName: row.departmentName as string,
      status: row.status as OrderTask['status'],
      estimatedDuration: row.estimatedDuration as number | null,
      // SQLite timestamps are in seconds, JS Date expects milliseconds
      startedAt: row.startedAt ? new Date((row.startedAt as number) * 1000) : null,
      completedAt: row.completedAt ? new Date((row.completedAt as number) * 1000) : null,
    }));
  } catch (error) {
    console.error('Error getting order tasks:', error);
    return [];
  }
}

// Verify customer access to order
export async function canCustomerAccessOrder(customerId: string, customerName: string, orderId: string): Promise<boolean> {
  const order = await getOrderById(orderId);
  if (!order) return false;
  
  return order.clientEntityId === customerId || 
         (order.clientName?.toLowerCase().includes(customerName.toLowerCase()) ?? false);
}

// Product for quote display (grouped from services)
// Sticker/dimension info for product
export interface ProductDimension {
  width: number;  // mm
  height: number; // mm
  pieces: number;
  name?: string;
}

// Extract sticker/dimension info from input_fields_data
// Format: width_mm_1, height_mm_1, pieces_1, width_mm_2, height_mm_2, pieces_2, etc.
function extractDimensionsFromInputFields(data: Record<string, any>): ProductDimension[] {
  const dimensions: ProductDimension[] = [];
  
  // Find all unique suffixes (1, 2, 3, ...)
  const suffixes = new Set<string>();
  Object.keys(data).forEach(key => {
    const match = key.match(/^(width_mm|height_mm|pieces)_(\d+)$/i);
    if (match) suffixes.add(match[2]);
  });
  
  // Also check for non-suffixed fields (single dimension)
  const hasWidth = 'width_mm' in data || 'width' in data || 'sirka' in data;
  const hasHeight = 'height_mm' in data || 'height' in data || 'vyska' in data;
  
  if (hasWidth && hasHeight && suffixes.size === 0) {
    const width = Number(data.width_mm || data.width || data.sirka || 0);
    const height = Number(data.height_mm || data.height || data.vyska || 0);
    const pieces = Number(data.pieces || data.pocet || data.ks || 1);
    
    if (width > 0 && height > 0) {
      dimensions.push({ width, height, pieces, name: 'Nálepka' });
    }
  }
  
  // Process suffixed fields
  Array.from(suffixes).sort((a, b) => Number(a) - Number(b)).forEach((suffix, idx) => {
    const width = Number(data[`width_mm_${suffix}`] || 0);
    const height = Number(data[`height_mm_${suffix}`] || 0);
    const pieces = Number(data[`pieces_${suffix}`] || 1);
    
    if (width > 0 && height > 0) {
      dimensions.push({
        width,
        height,
        pieces,
        name: `Nálepka ${idx + 1}`,
      });
    }
  });
  
  return dimensions;
}

export interface QuoteProduct {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  totalPrice: number;
  services: { name: string; price: number }[];
  dimensions?: ProductDimension[]; // Optional sticker dimensions
}

// Get products for quote (group services by product ID)
export async function getQuoteProducts(orderId: string, orderName: string): Promise<QuoteProduct[]> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT service_id, service_name, quantity, unit, sale_price, total_price, service_category, input_fields_data
        FROM order_services 
        WHERE order_id = ?
        ORDER BY sequence ASC, created_at ASC
      `,
      args: [orderId]
    });
    
    // Group by product ID (extracted from service_id format: {product_id}-service-{service_id})
    const productsMap = new Map<string, {
      services: { name: string; price: number }[];
      totalPrice: number;
      quantity: number;
      unit: string;
      inputFieldsData: Record<string, any>;
    }>();
    
    for (const row of result.rows) {
      const serviceId = row.service_id as string;
      const serviceName = row.service_name as string;
      const totalPrice = (row.total_price as number) || 0;
      const quantity = (row.quantity as number) || 1;
      const unit = (row.unit as string) || 'ks';
      const inputFieldsDataRaw = row.input_fields_data;
      
      // Parse input_fields_data
      let inputFieldsData: Record<string, any> = {};
      if (inputFieldsDataRaw) {
        try {
          inputFieldsData = typeof inputFieldsDataRaw === 'string' 
            ? JSON.parse(inputFieldsDataRaw) 
            : inputFieldsDataRaw as Record<string, any>;
        } catch { /* ignore */ }
      }
      
      // Skip zero-price automatic services (like FAKTURÁCIA)
      if (totalPrice === 0 && serviceName.includes('automatická')) continue;
      
      // Extract product ID from service_id
      const match = serviceId.match(/^([a-f0-9-]{36})-service-/);
      const productId = match ? match[1] : 'standalone';
      
      if (!productsMap.has(productId)) {
        productsMap.set(productId, {
          services: [],
          totalPrice: 0,
          quantity: quantity,
          unit: unit,
          inputFieldsData: {},
        });
      }
      
      const product = productsMap.get(productId)!;
      product.services.push({ name: serviceName, price: totalPrice });
      product.totalPrice += totalPrice;
      // Merge input fields data
      product.inputFieldsData = { ...product.inputFieldsData, ...inputFieldsData };
    }
    
    // Convert to array
    const products: QuoteProduct[] = [];
    let idx = 0;
    
    for (const [productId, data] of productsMap) {
      // Generate product name from order name or first service
      let productName = orderName.replace(/^Kalkulácia\s*-\s*/i, '').trim();
      if (productsMap.size > 1 && idx > 0) {
        productName = data.services[0]?.name || `Produkt ${idx + 1}`;
      }
      
      // Extract sticker dimensions from input fields
      const dimensions = extractDimensionsFromInputFields(data.inputFieldsData);
      
      products.push({
        id: productId,
        name: productName,
        quantity: data.quantity,
        unit: data.unit,
        unitPrice: data.totalPrice / data.quantity,
        totalPrice: data.totalPrice,
        services: data.services,
        dimensions: dimensions.length > 0 ? dimensions : undefined,
      });
      idx++;
    }
    
    return products;
  } catch (error) {
    console.error('Error getting quote products:', error);
    return [];
  }
}

// Get product dimensions from calculation EAV data
export async function getCalculationProductDimensions(calculationId: string | null): Promise<Map<string, ProductDimension[]>> {
  const dimensionsMap = new Map<string, ProductDimension[]>();
  if (!calculationId) return dimensionsMap;
  
  try {
    const db = getClient();
    
    // Find calculation entity
    const calcResult = await db.execute({
      sql: `
        SELECT e.id as entity_id
        FROM entities e
        JOIN attributes a ON a.entity_id = e.id
        WHERE a.attribute_name = 'id' AND a.string_value = ?
        LIMIT 1
      `,
      args: [calculationId]
    });
    
    if (calcResult.rows.length === 0) return dimensionsMap;
    
    const entityId = calcResult.rows[0].entity_id as string;
    
    // Get all relevant attributes for products
    const dataResult = await db.execute({
      sql: `
        SELECT attribute_name, json_value, string_value 
        FROM attributes 
        WHERE entity_id = ? AND (
          attribute_name = 'calculationData' OR 
          attribute_name = 'products' OR
          attribute_name = 'calculationData.products'
        )
      `,
      args: [entityId]
    });
    
    let products: any[] = [];
    
    for (const row of dataResult.rows) {
      const attrName = row.attribute_name as string;
      const rawData = row.json_value || row.string_value;
      
      if (!rawData) continue;
      
      let parsed: any = null;
      try {
        parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      } catch { continue; }
      
      if (attrName === 'calculationData' && parsed?.products) {
        products = parsed.products;
        break;
      } else if ((attrName === 'products' || attrName === 'calculationData.products') && Array.isArray(parsed)) {
        products = parsed;
        break;
      }
    }
    
    for (const product of products) {
      const customFields = product.customFieldValues || product.calculatorInputValues || {};
      const dimensions = extractDimensionsFromInputFields(customFields);
      
      if (dimensions.length > 0) {
        const productId = product.id || product.productId || 'first';
        dimensionsMap.set(productId, dimensions);
      }
    }
    
    return dimensionsMap;
  } catch (error) {
    console.error('Error getting calculation product dimensions:', error);
    return dimensionsMap;
  }
}

// Get products with prices from calculation EAV
export async function getCalculationProducts(calculationId: string | null): Promise<QuoteProduct[]> {
  if (!calculationId) return [];
  
  try {
    const db = getClient();
    
    // Find calculation entity
    const calcResult = await db.execute({
      sql: `
        SELECT e.id as entity_id
        FROM entities e
        JOIN attributes a ON a.entity_id = e.id
        WHERE a.attribute_name = 'id' AND a.string_value = ?
        LIMIT 1
      `,
      args: [calculationId]
    });
    
    if (calcResult.rows.length === 0) return [];
    
    const entityId = calcResult.rows[0].entity_id as string;
    
    // Get all relevant attributes for products and totals
    const dataResult = await db.execute({
      sql: `
        SELECT attribute_name, json_value, string_value, number_value
        FROM attributes 
        WHERE entity_id = ? AND (
          attribute_name = 'calculationData' OR 
          attribute_name = 'products' OR
          attribute_name = 'calculationData.products' OR
          attribute_name = 'totalPrice' OR
          attribute_name = 'actualTotalPrice'
        )
      `,
      args: [entityId]
    });
    
    let products: any[] = [];
    let totalPrice: number | null = null;
    
    for (const row of dataResult.rows) {
      const attrName = row.attribute_name as string;
      const rawData = row.json_value || row.string_value;
      const numValue = row.number_value as number | null;
      
      if (attrName === 'totalPrice' || attrName === 'actualTotalPrice') {
        if (numValue != null) totalPrice = numValue;
        continue;
      }
      
      if (!rawData) continue;
      
      let parsed: any = null;
      try {
        parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      } catch { continue; }
      
      if (attrName === 'calculationData' && parsed?.products) {
        products = parsed.products;
      } else if ((attrName === 'products' || attrName === 'calculationData.products') && Array.isArray(parsed)) {
        products = parsed;
      }
    }
    
    // Convert to QuoteProduct format
    const quoteProducts: QuoteProduct[] = products.map((product: any) => {
      const customFields = product.customFieldValues || product.calculatorInputValues || {};
      const dimensions = extractDimensionsFromInputFields(customFields);
      
      // Get price from product - check multiple possible fields
      const productTotalCost = product.totalCost || product.finalPrice || product.price || product.salePrice || 0;
      const quantity = product.quantity || product.calculatedQuantity || 1;
      const unit = product.variant?.unit || product.unit || 'ks';
      
      // Build product name from category + variant name (like main app shows)
      // Format: "Leták - Plagát Vitajte" or just variant name if no category
      const categoryName = product.product?.name || 
                           product.product?.categoryName || 
                           product.categoryName || 
                           '';
      const variantName = product.variant?.name || 
                          product.variant?.variantName ||
                          product.variantName ||
                          product.name ||
                          product.templateName ||
                          '';
      
      // Combine category and variant name, or use just one if available
      let name = 'Produkt';
      if (categoryName && variantName && categoryName !== variantName) {
        name = `${categoryName} - ${variantName}`;
      } else if (variantName) {
        name = variantName;
      } else if (categoryName) {
        name = categoryName;
      }
      
      return {
        id: product.id || product.productId || 'unknown',
        name,
        quantity,
        unit,
        unitPrice: quantity > 0 ? productTotalCost / quantity : productTotalCost,
        totalPrice: productTotalCost,
        services: [],
        dimensions: dimensions.length > 0 ? dimensions : undefined,
      };
    });
    
    return quoteProducts;
  } catch (error) {
    console.error('Error getting calculation products:', error);
    return [];
  }
}

// Get calculation share link if exists
export async function getCalculationShareLink(calculationId: string | null): Promise<string | null> {
  if (!calculationId) return null;
  
  try {
    const db = getClient();
    
    // Check calculation_shares for direct share
    const shareResult = await db.execute({
      sql: `
        SELECT token FROM calculation_shares 
        WHERE calculation_id = ? AND expires_at > ?
        ORDER BY created_at DESC
        LIMIT 1
      `,
      args: [calculationId, Math.floor(Date.now() / 1000)]
    });
    
    if (shareResult.rows.length > 0) {
      const token = shareResult.rows[0].token as string;
      // Return link to main app quote page
      return `/quote/${token}`;
    }
    
    // Check calculation_quote_bundles for bundle share
    const bundleResult = await db.execute({
      sql: `
        SELECT token, item_share_tokens FROM calculation_quote_bundles 
        WHERE calculation_ids LIKE ? AND expires_at > ? AND status = 'active'
        ORDER BY created_at DESC
        LIMIT 1
      `,
      args: [`%${calculationId}%`, Math.floor(Date.now() / 1000)]
    });
    
    if (bundleResult.rows.length > 0) {
      const bundleToken = bundleResult.rows[0].token as string;
      const itemTokens = JSON.parse(bundleResult.rows[0].item_share_tokens as string || '{}');
      const itemToken = itemTokens[calculationId];
      
      if (itemToken) {
        // Return link to bundle quote page with specific item
        return `/quote/bundle/${bundleToken}?item=${itemToken}`;
      }
      return `/quote/bundle/${bundleToken}`;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting calculation share link:', error);
    return null;
  }
}

// EAV Table IDs (cached)
const EAV_TABLES = {
  calculations: 'fc3eb1c9-224a-4da7-919b-fab762bdc6c6',
  projects: '65d05590-1c20-4d88-8e82-bfcbf9b9e23f',
};

// Pagination options
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

// OPTIMIZED: Batch load EAV attributes for multiple entities in ONE query
async function getBatchEavEntityData(entityIds: string[]): Promise<Map<string, Record<string, any>>> {
  if (entityIds.length === 0) return new Map();
  
  const db = getClient();
  const placeholders = entityIds.map(() => '?').join(',');
  
  const result = await db.execute({
    sql: `SELECT entity_id, attribute_name, string_value, number_value, boolean_value, date_value, json_value 
          FROM attributes WHERE entity_id IN (${placeholders})`,
    args: entityIds
  });
  
  const dataMap = new Map<string, Record<string, any>>();
  
  for (const row of result.rows) {
    const entityId = row.entity_id as string;
    if (!dataMap.has(entityId)) {
      dataMap.set(entityId, {});
    }
    const data = dataMap.get(entityId)!;
    const name = row.attribute_name as string;
    data[name] = row.string_value || row.number_value || row.boolean_value || row.date_value || row.json_value;
  }
  
  return dataMap;
}

// OPTIMIZED: Get projects for a client with pagination
export async function getClientProjects(
  clientEntityId: string, 
  clientName: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<Project>> {
  const { limit = 20, offset = 0 } = options;
  
  try {
    const db = getClient();
    
    // Get entity IDs with a single optimized query using UNION
    const entitiesResult = await db.execute({
      sql: `
        SELECT DISTINCT e.id as entityId
        FROM entities e 
        JOIN attributes a ON e.id = a.entity_id 
        WHERE e.table_id = ? 
          AND (
            (a.attribute_name = 'clientEntityId' AND a.string_value = ?)
            OR (a.attribute_name = 'companyName' AND a.string_value LIKE ?)
          )
      `,
      args: [EAV_TABLES.projects, clientEntityId, `%${clientName}%`]
    });
    
    const allEntityIds = entitiesResult.rows.map(r => r.entityId as string);
    const total = allEntityIds.length;
    
    if (total === 0) return { items: [], total: 0, hasMore: false };
    
    // Apply pagination
    const paginatedIds = allEntityIds.slice(offset, offset + limit);
    
    // BATCH LOAD: Get all attributes in ONE query
    const dataMap = await getBatchEavEntityData(paginatedIds);
    
    // Build projects from batch data
    const projects: Project[] = [];
    for (const entityId of paginatedIds) {
      const data = dataMap.get(entityId) || {};
      projects.push({
        id: data.id || '',
        entityId: entityId,
        name: data.name || 'Bez názvu',
        projectNumber: data.projectNumber || '',
        companyName: data.companyName || '',
        clientEntityId: data.clientEntityId || '',
        totalPrice: Number(data.totalPrice) || 0,
        calculationsCount: Number(data.calculationsCount) || 0,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      });
    }
    
    // Sort by updatedAt desc
    projects.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    
    return {
      items: projects,
      total,
      hasMore: offset + limit < total
    };
  } catch (error) {
    console.error('Error getting client projects:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

// OPTIMIZED: Get calculations for a client with pagination
export async function getClientCalculations(
  clientEntityId: string, 
  clientName: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<Calculation>> {
  const { limit = 20, offset = 0 } = options;
  
  try {
    const db = getClient();
    
    // Get entity IDs with a single optimized query
    const entitiesResult = await db.execute({
      sql: `
        SELECT DISTINCT e.id as entityId
        FROM entities e 
        JOIN attributes a ON e.id = a.entity_id 
        WHERE e.table_id = ? 
          AND (
            (a.attribute_name = 'clientEntityId' AND a.string_value = ?)
            OR (a.attribute_name = 'calculationData.selectedClient.name' AND a.string_value LIKE ?)
          )
      `,
      args: [EAV_TABLES.calculations, clientEntityId, `%${clientName}%`]
    });
    
    const allEntityIds = entitiesResult.rows.map(r => r.entityId as string);
    const total = allEntityIds.length;
    
    if (total === 0) return { items: [], total: 0, hasMore: false };
    
    // Apply pagination
    const paginatedIds = allEntityIds.slice(offset, offset + limit);
    
    // BATCH LOAD: Get all attributes in ONE query
    const dataMap = await getBatchEavEntityData(paginatedIds);
    
    // Get share tokens for calculations (only for visible ones)
    const calcIds = paginatedIds.map(id => dataMap.get(id)?.id).filter(Boolean);
    const shareTokens = new Map<string, { token: string; expiresAt: Date }>();
    
    if (calcIds.length > 0) {
      const placeholders = calcIds.map(() => '?').join(',');
      const sharesResult = await db.execute({
        sql: `SELECT calculation_id, token, expires_at 
              FROM calculation_shares 
              WHERE status = 'active' AND expires_at > ? AND calculation_id IN (${placeholders})`,
        args: [Math.floor(Date.now() / 1000), ...calcIds]
      });
      for (const row of sharesResult.rows) {
        shareTokens.set(row.calculation_id as string, {
          token: row.token as string,
          expiresAt: new Date((row.expires_at as number) * 1000),
        });
      }
    }
    
    // Build calculations from batch data
    const calculations: Calculation[] = [];
    for (const entityId of paginatedIds) {
      const data = dataMap.get(entityId) || {};
      const share = shareTokens.get(data.id);
      
      calculations.push({
        id: data.id || '',
        entityId: entityId,
        name: data.name || 'Bez názvu',
        calculationNumber: data.calculationNumber || '',
        description: data.description || null,
        status: data.status || 'draft',
        approvalStatus: (data.approvalStatus || 'DRAFT') as Calculation['approvalStatus'],
        projectId: data.projectId || null,
        clientEntityId: data.clientEntityId || null,
        totalPrice: Number(data.actualTotalPrice || data.totalPrice) || null,
        shareToken: share?.token || null,
        shareExpiresAt: share?.expiresAt || null,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      });
    }
    
    // Sort by updatedAt desc
    calculations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    
    return {
      items: calculations,
      total,
      hasMore: offset + limit < total
    };
  } catch (error) {
    console.error('Error getting client calculations:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

// LAZY LOADING: Get calculations for a specific project only
export async function getProjectCalculations(
  projectId: string,
  options: PaginationOptions = {}
): Promise<PaginatedResult<Calculation>> {
  const { limit = 10, offset = 0 } = options;
  
  try {
    const db = getClient();
    
    // Get calculation entity IDs for this project
    const entitiesResult = await db.execute({
      sql: `
        SELECT e.id as entityId
        FROM entities e 
        JOIN attributes a ON e.id = a.entity_id 
        WHERE e.table_id = ? 
          AND a.attribute_name = 'projectId' 
          AND a.string_value = ?
      `,
      args: [EAV_TABLES.calculations, projectId]
    });
    
    const allEntityIds = entitiesResult.rows.map(r => r.entityId as string);
    const total = allEntityIds.length;
    
    if (total === 0) return { items: [], total: 0, hasMore: false };
    
    // Apply pagination
    const paginatedIds = allEntityIds.slice(offset, offset + limit);
    
    // BATCH LOAD attributes
    const dataMap = await getBatchEavEntityData(paginatedIds);
    
    // Get share tokens
    const calcIds = paginatedIds.map(id => dataMap.get(id)?.id).filter(Boolean);
    const shareTokens = new Map<string, { token: string; expiresAt: Date }>();
    
    if (calcIds.length > 0) {
      const placeholders = calcIds.map(() => '?').join(',');
      const sharesResult = await db.execute({
        sql: `SELECT calculation_id, token, expires_at 
              FROM calculation_shares 
              WHERE status = 'active' AND expires_at > ? AND calculation_id IN (${placeholders})`,
        args: [Math.floor(Date.now() / 1000), ...calcIds]
      });
      for (const row of sharesResult.rows) {
        shareTokens.set(row.calculation_id as string, {
          token: row.token as string,
          expiresAt: new Date((row.expires_at as number) * 1000),
        });
      }
    }
    
    // Build calculations
    const calculations: Calculation[] = [];
    for (const entityId of paginatedIds) {
      const data = dataMap.get(entityId) || {};
      const share = shareTokens.get(data.id);
      
      calculations.push({
        id: data.id || '',
        entityId: entityId,
        name: data.name || 'Bez názvu',
        calculationNumber: data.calculationNumber || '',
        description: data.description || null,
        status: data.status || 'draft',
        approvalStatus: (data.approvalStatus || 'DRAFT') as Calculation['approvalStatus'],
        projectId: data.projectId || null,
        clientEntityId: data.clientEntityId || null,
        totalPrice: Number(data.actualTotalPrice || data.totalPrice) || null,
        shareToken: share?.token || null,
        shareExpiresAt: share?.expiresAt || null,
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
      });
    }
    
    calculations.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    
    return {
      items: calculations,
      total,
      hasMore: offset + limit < total
    };
  } catch (error) {
    console.error('Error getting project calculations:', error);
    return { items: [], total: 0, hasMore: false };
  }
}

// Get single calculation by ID
export async function getCalculationById(calculationId: string): Promise<Calculation | null> {
  try {
    const db = getClient();
    
    // Find entity by calculation ID
    const entity = await db.execute({
      sql: `SELECT e.id as entityId 
            FROM entities e 
            JOIN attributes a ON e.id = a.entity_id 
            WHERE e.table_id = ? 
              AND a.attribute_name = 'id' 
              AND a.string_value = ?
            LIMIT 1`,
      args: [EAV_TABLES.calculations, calculationId]
    });
    
    if (entity.rows.length === 0) return null;
    
    const entityId = entity.rows[0].entityId as string;
    
    // Get all attributes for this entity
    const attrsResult = await db.execute({
      sql: `SELECT attribute_name, string_value, number_value, boolean_value, date_value, json_value 
            FROM attributes WHERE entity_id = ?`,
      args: [entityId]
    });
    
    const data: Record<string, any> = { id: calculationId };
    for (const row of attrsResult.rows) {
      const name = row.attribute_name as string;
      data[name] = row.string_value || row.number_value || row.boolean_value || row.date_value || row.json_value;
    }
    
    // Get share token
    const shareResult = await db.execute({
      sql: `SELECT token, expires_at FROM calculation_shares 
            WHERE calculation_id = ? AND status = 'active' AND expires_at > ?
            ORDER BY created_at DESC LIMIT 1`,
      args: [calculationId, Math.floor(Date.now() / 1000)]
    });
    
    const share = shareResult.rows[0];
    
    return {
      id: data.id || '',
      entityId: entityId,
      name: data.name || 'Bez názvu',
      calculationNumber: data.calculationNumber || '',
      description: data.description || null,
      status: data.status || 'draft',
      approvalStatus: (data.approvalStatus || 'DRAFT') as Calculation['approvalStatus'],
      projectId: data.projectId || null,
      clientEntityId: data.clientEntityId || null,
      totalPrice: Number(data.actualTotalPrice || data.totalPrice) || null,
      shareToken: share ? (share.token as string) : null,
      shareExpiresAt: share ? new Date((share.expires_at as number) * 1000) : null,
      createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt) : new Date(),
    };
  } catch (error) {
    console.error('Error getting calculation:', error);
    return null;
  }
}

// Get order by calculation ID
export async function getOrderByCalculationId(calculationId: string): Promise<Order | null> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT 
          id, order_number as orderNumber, name, status, priority,
          client_name as clientName, client_entity_id as clientEntityId,
          calculation_id as calculationId,
          total_value as totalValue, services_count as servicesCount,
          start_date as startDate, planned_end_date as plannedEndDate,
          created_at as createdAt, updated_at as updatedAt
        FROM orders_v2 
        WHERE calculation_id = ?
        LIMIT 1
      `,
      args: [calculationId]
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      id: row.id as string,
      orderNumber: row.orderNumber as string,
      name: row.name as string,
      status: row.status as string,
      priority: row.priority as number || 0,
      clientName: row.clientName as string | null,
      clientEntityId: row.clientEntityId as string | null,
      calculationId: row.calculationId as string | null,
      totalValue: row.totalValue as number | null,
      servicesCount: row.servicesCount as number | null,
      startDate: row.startDate ? new Date((row.startDate as number) * 1000) : null,
      plannedEndDate: row.plannedEndDate ? new Date((row.plannedEndDate as number) * 1000) : null,
      createdAt: row.createdAt ? new Date((row.createdAt as number) * 1000) : new Date(),
      updatedAt: row.updatedAt ? new Date((row.updatedAt as number) * 1000) : new Date(),
    };
  } catch (error) {
    console.error('Error getting order by calculation ID:', error);
    return null;
  }
}

// Old getCalculationProducts removed - using new version at line ~619

// Check if client can access calculation
export async function canClientAccessCalculation(
  clientEntityId: string, 
  clientName: string, 
  calculationId: string
): Promise<boolean> {
  try {
    const db = getClient();
    
    // Find entity by calculation ID
    const entity = await db.execute({
      sql: `SELECT e.id as entityId 
            FROM entities e 
            JOIN attributes a ON e.id = a.entity_id 
            WHERE e.table_id = ? 
              AND a.attribute_name = 'id' 
              AND a.string_value = ?
            LIMIT 1`,
      args: [EAV_TABLES.calculations, calculationId]
    });
    
    if (entity.rows.length === 0) return false;
    
    const entityId = entity.rows[0].entityId as string;
    
    // Check if client matches
    const clientCheck = await db.execute({
      sql: `SELECT 1 FROM attributes 
            WHERE entity_id = ? 
              AND ((attribute_name = 'clientEntityId' AND string_value = ?)
                   OR (attribute_name = 'companyName' AND string_value LIKE ?))
            LIMIT 1`,
      args: [entityId, clientEntityId, `%${clientName}%`]
    });
    
    return clientCheck.rows.length > 0;
  } catch (error) {
    console.error('Error checking calculation access:', error);
    return false;
  }
}

// Get calculation by share token (public quote page)
export interface PublicQuoteData {
  calculation: {
    id: string;
    name: string;
    description: string | null;
    approvalStatus: string;
    calculationData: any;
    totalPrice: number | null;
    companyName: string | null;
  };
  share: {
    token: string;
    expiresAt: Date | null;
    status: string;
    clientResponse: string | null;
  };
  organization: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    ico: string | null;
    dic: string | null;
    icDph: string | null;
    vatRate: number | null;
  } | null;
}

export async function getCalculationByShareToken(
  calculationId: string, 
  token: string
): Promise<PublicQuoteData | null> {
  try {
    const db = getClient();
    
    // Verify share token is valid
    const shareResult = await db.execute({
      sql: `SELECT token, expires_at, status, client_response, organization_id
            FROM calculation_shares 
            WHERE calculation_id = ? AND token = ?
            LIMIT 1`,
      args: [calculationId, token]
    });
    
    if (shareResult.rows.length === 0) return null;
    
    const shareRow = shareResult.rows[0];
    const organizationId = shareRow.organization_id as string | null;
    
    // Get calculation entity data
    const entityResult = await db.execute({
      sql: `SELECT e.id as entityId 
            FROM entities e 
            JOIN attributes a ON e.id = a.entity_id 
            WHERE e.table_id = ? 
              AND a.attribute_name = 'id' 
              AND a.string_value = ?
            LIMIT 1`,
      args: [EAV_TABLES.calculations, calculationId]
    });
    
    if (entityResult.rows.length === 0) return null;
    
    const entityId = entityResult.rows[0].entityId as string;
    
    // Get all calculation attributes
    const attrsResult = await db.execute({
      sql: `SELECT attribute_name, string_value, number_value, json_value 
            FROM attributes WHERE entity_id = ?`,
      args: [entityId]
    });
    
    const data: Record<string, any> = { id: calculationId };
    for (const row of attrsResult.rows) {
      const name = row.attribute_name as string;
      data[name] = row.json_value || row.string_value || row.number_value;
    }
    
    // Parse calculationData if it's a string
    let calculationData = data.calculationData;
    if (typeof calculationData === 'string') {
      try {
        calculationData = JSON.parse(calculationData);
      } catch { /* ignore */ }
    }
    
    // Get organization data if available
    let organization: PublicQuoteData['organization'] = null;
    if (organizationId) {
      const orgResult = await db.execute({
        sql: `SELECT name, email, phone, address, ico, dic, ic_dph as icDph, vat_rate as vatRate
              FROM organizations WHERE id = ? LIMIT 1`,
        args: [organizationId]
      });
      
      if (orgResult.rows.length > 0) {
        const orgRow = orgResult.rows[0];
        organization = {
          name: orgRow.name as string,
          email: orgRow.email as string | null,
          phone: orgRow.phone as string | null,
          address: orgRow.address as string | null,
          ico: orgRow.ico as string | null,
          dic: orgRow.dic as string | null,
          icDph: orgRow.icDph as string | null,
          vatRate: orgRow.vatRate as number | null,
        };
      }
    }
    
    return {
      calculation: {
        id: calculationId,
        name: data.name || 'Cenová ponuka',
        description: data.description || null,
        approvalStatus: data.approvalStatus || 'DRAFT',
        calculationData: calculationData || {},
        totalPrice: Number(data.actualTotalPrice || data.totalPrice) || null,
        companyName: data.companyName || calculationData?.selectedClient?.name || null,
      },
      share: {
        token: shareRow.token as string,
        expiresAt: shareRow.expires_at ? new Date((shareRow.expires_at as number) * 1000) : null,
        status: shareRow.status as string,
        clientResponse: shareRow.client_response as string | null,
      },
      organization,
    };
  } catch (error) {
    console.error('Error getting calculation by share token:', error);
    return null;
  }
}

// Update quote response (approve/reject/request changes)
export async function updateQuoteResponse(
  calculationId: string,
  token: string,
  action: 'approved' | 'rejected' | 'requested_changes',
  comment?: string
): Promise<boolean> {
  try {
    const db = getClient();
    
    // Verify token is valid first
    const shareResult = await db.execute({
      sql: `SELECT id, expires_at FROM calculation_shares 
            WHERE calculation_id = ? AND token = ? AND status = 'active'
            LIMIT 1`,
      args: [calculationId, token]
    });
    
    if (shareResult.rows.length === 0) return false;
    
    const shareRow = shareResult.rows[0];
    const expiresAt = shareRow.expires_at as number;
    
    // Check if expired
    if (expiresAt && expiresAt < Math.floor(Date.now() / 1000)) {
      return false;
    }
    
    // Map action to approval status
    const approvalStatusMap: Record<string, string> = {
      'approved': 'CLIENT_APPROVED',
      'rejected': 'CLIENT_REJECTED',
      'requested_changes': 'CLIENT_REQUESTED_CHANGES',
    };
    
    const newApprovalStatus = approvalStatusMap[action];
    
    // Update share with response
    await db.execute({
      sql: `UPDATE calculation_shares 
            SET client_response = ?, responded_at = ?, status = ?
            WHERE calculation_id = ? AND token = ?`,
      args: [action, Math.floor(Date.now() / 1000), action === 'approved' ? 'responded' : 'active', calculationId, token]
    });
    
    // Update calculation approval status via EAV
    const entityResult = await db.execute({
      sql: `SELECT e.id as entityId 
            FROM entities e 
            JOIN attributes a ON e.id = a.entity_id 
            WHERE e.table_id = ? 
              AND a.attribute_name = 'id' 
              AND a.string_value = ?
            LIMIT 1`,
      args: [EAV_TABLES.calculations, calculationId]
    });
    
    if (entityResult.rows.length > 0) {
      const entityId = entityResult.rows[0].entityId as string;
      
      // Update or insert approvalStatus attribute
      await db.execute({
        sql: `INSERT OR REPLACE INTO attributes (entity_id, attribute_name, string_value, updated_at)
              VALUES (?, 'approvalStatus', ?, ?)`,
        args: [entityId, newApprovalStatus, Math.floor(Date.now() / 1000)]
      });
    }
    
    return true;
  } catch (error) {
    console.error('Error updating quote response:', error);
    return false;
  }
}

// Get quote bundle by token (public bundle page)
export interface QuoteBundleItem {
  id: string;
  name: string;
  description: string | null;
  totalPrice: number | null;
  shareUrl: string | null;
  clientResponse: string | null; // 'approved', 'rejected', 'question', null
  respondedAt: Date | null;
}

export interface QuoteBundleData {
  bundle: {
    id: string;
    name: string | null;
    expiresAt: Date | null;
    status: string;
  };
  items: QuoteBundleItem[];
  organization: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    ico: string | null;
    vatRate: number | null;
  } | null;
}

export async function getQuoteBundleByToken(
  bundleId: string,
  token: string
): Promise<QuoteBundleData | null> {
  try {
    const db = getClient();
    
    // Get bundle data
    const bundleResult = await db.execute({
      sql: `SELECT id, token, calculation_ids, item_share_tokens, expires_at, status, organization_id, project_name
            FROM calculation_quote_bundles 
            WHERE id = ? AND token = ?
            LIMIT 1`,
      args: [bundleId, token]
    });
    
    if (bundleResult.rows.length === 0) return null;
    
    const bundleRow = bundleResult.rows[0];
    const calculationIdsRaw = bundleRow.calculation_ids as string;
    const itemShareTokensRaw = bundleRow.item_share_tokens as string;
    const organizationId = bundleRow.organization_id as string | null;
    
    let calculationIds: string[] = [];
    let itemShareTokens: Record<string, string> = {};
    
    try {
      calculationIds = JSON.parse(calculationIdsRaw);
      itemShareTokens = JSON.parse(itemShareTokensRaw || '{}');
    } catch { /* ignore */ }
    
    // Get calculation details for each item
    const items: QuoteBundleItem[] = [];
    
    for (const calcId of calculationIds) {
      // Find calculation entity
      const entityResult = await db.execute({
        sql: `SELECT e.id as entityId 
              FROM entities e 
              JOIN attributes a ON e.id = a.entity_id 
              WHERE e.table_id = ? 
                AND a.attribute_name = 'id' 
                AND a.string_value = ?
              LIMIT 1`,
        args: [EAV_TABLES.calculations, calcId]
      });
      
      if (entityResult.rows.length === 0) continue;
      
      const entityId = entityResult.rows[0].entityId as string;
      
      // Get calculation attributes
      const attrsResult = await db.execute({
        sql: `SELECT attribute_name, string_value, number_value 
              FROM attributes WHERE entity_id = ? 
                AND attribute_name IN ('name', 'description', 'actualTotalPrice', 'totalPrice')`,
        args: [entityId]
      });
      
      const data: Record<string, any> = {};
      for (const row of attrsResult.rows) {
        const name = row.attribute_name as string;
        data[name] = row.string_value || row.number_value;
      }
      
      const itemToken = itemShareTokens[calcId];
      
      // Get share status (client response)
      let clientResponse: string | null = null;
      let respondedAt: Date | null = null;
      if (itemToken) {
        const shareResult = await db.execute({
          sql: `SELECT client_response, responded_at FROM calculation_shares 
                WHERE calculation_id = ? AND token = ? LIMIT 1`,
          args: [calcId, itemToken]
        });
        if (shareResult.rows.length > 0) {
          clientResponse = shareResult.rows[0].client_response as string | null;
          const respondedAtRaw = shareResult.rows[0].responded_at as number | null;
          respondedAt = respondedAtRaw ? new Date(respondedAtRaw * 1000) : null;
        }
      }
      
      items.push({
        id: calcId,
        name: data.name || 'Kalkulácia',
        description: data.description || null,
        totalPrice: Number(data.actualTotalPrice || data.totalPrice) || null,
        shareUrl: itemToken ? `/quote/${calcId}/${itemToken}` : null,
        clientResponse,
        respondedAt,
      });
    }
    
    // Get organization data if available
    let organization: QuoteBundleData['organization'] = null;
    if (organizationId) {
      const orgResult = await db.execute({
        sql: `SELECT name, email, phone, address, ico, vat_rate as vatRate
              FROM organizations WHERE id = ? LIMIT 1`,
        args: [organizationId]
      });
      
      if (orgResult.rows.length > 0) {
        const orgRow = orgResult.rows[0];
        organization = {
          name: orgRow.name as string,
          email: orgRow.email as string | null,
          phone: orgRow.phone as string | null,
          address: orgRow.address as string | null,
          ico: orgRow.ico as string | null,
          vatRate: orgRow.vatRate as number | null,
        };
      }
    }
    
    return {
      bundle: {
        id: bundleRow.id as string,
        name: bundleRow.project_name as string | null,
        expiresAt: bundleRow.expires_at ? new Date((bundleRow.expires_at as number) * 1000) : null,
        status: bundleRow.status as string,
      },
      items,
      organization,
    };
  } catch (error) {
    console.error('Error getting quote bundle by token:', error);
    return null;
  }
}

// Check if database is configured
export function isDatabaseConfigured(): boolean {
  return !!DB_URL;
}

export function getConnectionError(): string | null {
  return connectionError;
}
