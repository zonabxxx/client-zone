import { createClient, type Client } from '@libsql/client';

// Database connection configuration
// Priority: 1. DB_URL env var (Turso cloud), 2. Local file fallback
const DB_URL = import.meta.env.DB_URL || process.env.DB_URL;
const DB_TOKEN = import.meta.env.DB_TOKEN || process.env.DB_TOKEN;

let client: Client | null = null;
let connectionError: string | null = null;

export function getClient(): Client {
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
  entityId: string; // entityId from customers table - used for product template matching
  name: string;
  email: string | null;
  contactEmail: string | null;
  businessName: string | null;
  phone: string | null;
  organizationId: string;
}

// Customer Rating from FinStat integration
export interface CustomerRating {
  overallScore: number | null;        // 0-100
  ratingClass: string | null;         // A+, A, B+, B, C+, C, D, E
  riskLevel: string | null;           // NIZKE, STREDNE, VYSOKE, KRITICKE
  riskScore: number | null;           // 0-100
  financialScore: number | null;      // 0-100
  stabilityScore: number | null;      // 0-100
  ratingRecommendation: string | null;
  ratingBadges: string[] | null;
  ratingDetails: {
    risks: string[];
    strengths: string[];
    concerns: string[];
  } | null;
  ratingLastUpdate: Date | null;
  // Financial data
  totalRevenue: number | null;
  yearlyRevenue: number | null;
  currentProfit: number | null;
  // Payment info
  paymentDisciplineRating: string | null;
  customerCategory: string | null;
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
  approvalStatus: 'DRAFT' | 'CLIENT_VIEWED' | 'CLIENT_APPROVED' | 'CLIENT_REJECTED' | 'CLIENT_REQUESTED_CHANGES' | 'WAITING_FOR_CLIENT';
  projectId: string | null;
  clientEntityId: string | null;
  totalPrice: number | null;
  shareToken: string | null;
  shareExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  calculationData?: any; // Full calculation data including clientRequestMessage
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
        SELECT id, entity_id as entityId, name, email, contact_email as contactEmail, business_name as businessName, 
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
      entityId: (row.entityId as string) || (row.id as string), // fallback to id if entityId is null
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
          calculation_id as calculationId,
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
      calculationId: row.calculationId as string | null,
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

// Check if customer can access a calculation
export async function canCustomerAccessCalculation(customerId: string, customerName: string, calculationId: string): Promise<boolean> {
  const calculation = await getCalculationById(calculationId);
  if (!calculation) {
    console.log('[canCustomerAccessCalculation] Calculation not found:', calculationId);
    return false;
  }
  
  // Check by client entity ID or name match
  const calcClient = calculation.calculationData?.selectedClient;
  console.log('[canCustomerAccessCalculation] Check:', { 
    customerId, 
    customerName, 
    calcClientEntityId: calcClient?.entityId,
    calcClientId: calcClient?.id,
    calcClientName: calcClient?.name || calcClient?.['Názov'],
    clientEntityId: calculation.clientEntityId
  });
  
  if (calcClient) {
    if (calcClient.entityId === customerId || calcClient.id === customerId) return true;
    const calcClientName = calcClient.name || calcClient['Názov'] || '';
    if (calcClientName && customerName && calcClientName.toLowerCase().includes(customerName.toLowerCase())) return true;
    if (calcClientName && customerName && customerName.toLowerCase().includes(calcClientName.toLowerCase())) return true;
  }
  
  // Also check by clientEntityId from calculation
  if (calculation.clientEntityId === customerId) return true;
  
  console.log('[canCustomerAccessCalculation] Access DENIED');
  return false;
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
    let totalPrice: number | null = null;  // Price WITH commissions (for client)
    let actualTotalPrice: number | null = null;  // Price without commissions
    let globalPricingBreakdown: any = null;
    
    for (const row of dataResult.rows) {
      const attrName = row.attribute_name as string;
      const rawData = row.json_value || row.string_value;
      const numValue = row.number_value as number | null;
      
      // totalPrice includes commissions (referrer markup), actualTotalPrice is base price
      // For client portal, we want to show totalPrice (with commissions)
      if (attrName === 'totalPrice') {
        if (numValue != null) totalPrice = numValue;
        continue;
      }
      if (attrName === 'actualTotalPrice') {
        if (numValue != null) actualTotalPrice = numValue;
        continue;
      }
      
      if (!rawData) continue;
      
      let parsed: any = null;
      try {
        parsed = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      } catch { continue; }
      
      if (attrName === 'calculationData') {
        if (parsed?.products) {
        products = parsed.products;
        }
        // Extract global pricing breakdown for multipliers
        if (parsed?.globalPricingBreakdown) {
          globalPricingBreakdown = parsed.globalPricingBreakdown;
        }
      } else if ((attrName === 'products' || attrName === 'calculationData.products') && Array.isArray(parsed)) {
        products = parsed;
      }
    }
    
    // Calculate combined multiplier from global pricing (client rating + delivery term)
    const clientMultiplier = Number(globalPricingBreakdown?.clientMultiplier) || 1;
    const deliveryMultiplier = Number(globalPricingBreakdown?.deliveryMultiplier) || 1;
    const combinedMultiplier = clientMultiplier * deliveryMultiplier;
    
    // If we have a final price from global pricing, use it to calculate multiplier
    // This works for older calculations where breakdown wasn't saved
    const globalFinalPrice = Number(globalPricingBreakdown?.finalPrice) || 0;
    const globalOriginalPrice = Number(globalPricingBreakdown?.originalPrice) || 0;
    const priceRatio = (globalFinalPrice > 0 && globalOriginalPrice > 0) 
      ? globalFinalPrice / globalOriginalPrice 
      : combinedMultiplier;
    
    // Calculate product prices - if products don't have individual prices, distribute total
    // Prefer totalPrice (with commissions) over actualTotalPrice (base price)
    const finalTotalPrice = totalPrice || actualTotalPrice || 0;
    const productCount = products.length || 1;
    const perProductFallbackPrice = finalTotalPrice / productCount;
    
    // Convert to QuoteProduct format
    const quoteProducts: QuoteProduct[] = products.map((product: any) => {
      const customFields = product.customFieldValues || product.calculatorInputValues || {};
      const dimensions = extractDimensionsFromInputFields(customFields);
      
      // Get SALE price from product (not cost!) - prioritize adjusted prices, then sale prices
      // 1. Check if product already has global adjusted price
      const adjustedPrice = product.globalAdjustedPrice || product.adjustedPrice || 0;
      // 2. Get base SALE price (totalSale, originalSalePrice, salePrice - NOT totalCost which is purchase price!)
      const basePrice = product.totalSale || product.originalSalePrice || product.salePrice || product.finalPrice || product.price || 0;
      // 3. Use adjusted price if available, otherwise apply price ratio to base sale price
      // 4. If no sale price available, use per-product fallback from total calculation price
      let productTotalCost = adjustedPrice > 0 ? adjustedPrice : (basePrice * priceRatio);
      
      // Fallback: if productTotalCost is 0 but we have a total price, use that
      if (productTotalCost === 0 && perProductFallbackPrice > 0) {
        productTotalCost = perProductFallbackPrice;
      }
      
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
    
    // Get share tokens for calculations (include responded shares for approved calcs)
    const calcIds = paginatedIds.map(id => dataMap.get(id)?.id).filter(Boolean);
    const shareTokens = new Map<string, { token: string; expiresAt: Date }>();
    
    if (calcIds.length > 0) {
      const placeholders = calcIds.map(() => '?').join(',');
      // Include both 'active' and 'responded' shares (responded = client approved/rejected)
      const sharesResult = await db.execute({
        sql: `SELECT calculation_id, token, expires_at, status
              FROM calculation_shares 
              WHERE (status = 'active' OR status = 'responded') AND calculation_id IN (${placeholders})
              ORDER BY created_at DESC`,
        args: [...calcIds]
      });
      for (const row of sharesResult.rows) {
        const calcId = row.calculation_id as string;
        // Only store first (newest) share per calculation
        if (!shareTokens.has(calcId)) {
          shareTokens.set(calcId, {
            token: row.token as string,
            expiresAt: new Date((row.expires_at as number) * 1000),
          });
        }
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
    
    // Parse calculationData if it's a string
    let calculationData = null;
    if (data.calculationData) {
      try {
        calculationData = typeof data.calculationData === 'string' 
          ? JSON.parse(data.calculationData) 
          : data.calculationData;
      } catch (e) {
        console.error('Error parsing calculationData:', e);
      }
    }
    
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
      calculationData: calculationData, // Include full calculation data for clientRequestMessage etc.
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
          actual_end_date as actualEndDate,
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
      status: row.status as Order['status'],
      priority: row.priority as Order['priority'],
      clientName: row.clientName as string | null,
      clientEntityId: row.clientEntityId as string | null,
      calculationId: row.calculationId as string | null,
      totalValue: row.totalValue as number | null,
      servicesCount: row.servicesCount as number | null,
      startDate: row.startDate ? new Date((row.startDate as number) * 1000) : null,
      plannedEndDate: row.plannedEndDate ? new Date((row.plannedEndDate as number) * 1000) : null,
      actualEndDate: row.actualEndDate ? new Date((row.actualEndDate as number) * 1000) : null,
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
    clientComment: string | null;
    respondedAt: Date | null;
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
    invoicing?: {
      companyName?: string;
      street?: string;
      city?: string;
      postalCode?: string;
      country?: string;
      ico?: string;
      dic?: string;
      icDph?: string;
      email?: string;
      phone?: string;
      vatRate?: number;
      bankIban?: string;
      bankSwift?: string;
    };
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
      sql: `SELECT token, expires_at, status, client_response, client_comment, responded_at, organization_id
            FROM calculation_shares 
            WHERE calculation_id = ? AND token = ?
            LIMIT 1`,
      args: [calculationId, token]
    });
    
    console.log('[getCalculationByShareToken] Share result:', shareResult.rows.length);
    
    if (shareResult.rows.length === 0) {
      console.log('[getCalculationByShareToken] No share found for token');
      return null;
    }
    
    const shareRow = shareResult.rows[0];
    const organizationId = shareRow.organization_id as string | null;
    
    console.log('[getCalculationByShareToken] Organization ID:', organizationId);
    
    // Get calculations table ID for this organization (dynamic, not hardcoded)
    let calculationsTableId: string | null = null;
    if (organizationId) {
      const tableResult = await db.execute({
        sql: `SELECT id FROM table_definitions 
              WHERE organization_id = ? AND name = 'calculations'
              LIMIT 1`,
        args: [organizationId]
      });
      if (tableResult.rows.length > 0) {
        calculationsTableId = tableResult.rows[0].id as string;
      }
    }
    
    // Fallback to hardcoded if not found (for backwards compatibility)
    if (!calculationsTableId) {
      calculationsTableId = EAV_TABLES.calculations;
    }
    
    console.log('[getCalculationByShareToken] Using table ID:', calculationsTableId);
    
    // Get calculation entity data
    const entityResult = await db.execute({
      sql: `SELECT e.id as entityId 
            FROM entities e 
            JOIN attributes a ON e.id = a.entity_id 
            WHERE e.table_id = ? 
              AND a.attribute_name = 'id' 
              AND a.string_value = ?
            LIMIT 1`,
      args: [calculationsTableId, calculationId]
    });
    
    console.log('[getCalculationByShareToken] Entity result:', entityResult.rows.length);
    
    if (entityResult.rows.length === 0) {
      console.log('[getCalculationByShareToken] No entity found for calculation ID:', calculationId);
      return null;
    }
    
    const entityId = entityResult.rows[0].entityId as string;
    
    // Get all calculation attributes
    const attrsResult = await db.execute({
      sql: `SELECT attribute_name, string_value, number_value, json_value 
            FROM attributes WHERE entity_id = ?`,
      args: [entityId]
    });
    
    const data: Record<string, any> = { id: calculationId };
    // Reconstruct calculationData from flattened EAV attributes
    const calculationDataFromEav: Record<string, any> = {};
    
    for (const row of attrsResult.rows) {
      const name = row.attribute_name as string;
      let value = row.json_value || row.string_value || row.number_value;
      
      // Parse JSON values if stored as strings
      if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
        try {
          value = JSON.parse(value);
        } catch { /* keep as string */ }
      }
      
      // Handle flattened calculationData attributes (e.g., calculationData.products)
      if (name.startsWith('calculationData.')) {
        const subKey = name.replace('calculationData.', '');
        // Handle nested paths like calculationData.selectedClient.name
        if (subKey.includes('.')) {
          const parts = subKey.split('.');
          let current = calculationDataFromEav;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
        } else {
          calculationDataFromEav[subKey] = value;
        }
      } else if (name === 'calculationData') {
        // Handle case where calculationData is stored as single JSON blob
        if (typeof value === 'object') {
          Object.assign(calculationDataFromEav, value);
        }
      } else {
        data[name] = value;
      }
    }
    
    // Use reconstructed calculationData
    let calculationData = calculationDataFromEav;
    
    // Get organization data if available
    let organization: PublicQuoteData['organization'] = null;
    if (organizationId) {
      const orgResult = await db.execute({
        sql: `SELECT name, metadata FROM organization WHERE id = ? LIMIT 1`,
        args: [organizationId]
      });
      
      if (orgResult.rows.length > 0) {
        const orgRow = orgResult.rows[0];
        // Parse metadata for additional org info (invoicing data is stored here)
        let metadata: any = {};
        if (orgRow.metadata) {
          try {
            metadata = typeof orgRow.metadata === 'string' ? JSON.parse(orgRow.metadata) : orgRow.metadata;
          } catch { /* ignore */ }
        }
        
        // Invoicing data is in metadata.invoicing
        const invoicing = metadata.invoicing || {};
        
        organization = {
          name: orgRow.name as string,
          email: metadata.email || invoicing.email || null,
          phone: metadata.phone || invoicing.phone || null,
          address: metadata.address || null,
          ico: metadata.ico || invoicing.ico || null,
          dic: metadata.dic || invoicing.dic || null,
          icDph: metadata.icDph || metadata.ic_dph || invoicing.icDph || null,
          vatRate: metadata.vatRate || metadata.vat_rate || invoicing.vatRate || 23,
          // Add full invoicing object for PDF generation
          invoicing: invoicing,
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
        clientComment: shareRow.client_comment as string | null,
        respondedAt: shareRow.responded_at ? new Date((shareRow.responded_at as number) * 1000) : null,
      },
      organization,
    };
  } catch (error) {
    console.error('Error getting calculation by share token:', error);
    return null;
  }
}

// Update quote response (approve/reject/request changes/question)
export async function updateQuoteResponse(
  calculationId: string,
  token: string,
  action: 'approved' | 'rejected' | 'requested_changes' | 'question_received',
  comment?: string
): Promise<boolean> {
  try {
    const db = getClient();
    console.log('[updateQuoteResponse] Starting update for calculation:', calculationId, 'action:', action);
    
    // Verify token is valid first - try without status filter first
    const shareResult = await db.execute({
      sql: `SELECT id, expires_at, status FROM calculation_shares 
            WHERE calculation_id = ? AND token = ?
            LIMIT 1`,
      args: [calculationId, token]
    });
    
    console.log('[updateQuoteResponse] Share result:', JSON.stringify(shareResult.rows));
    
    if (shareResult.rows.length === 0) {
      console.log('[updateQuoteResponse] No share found for token');
      return false;
    }
    
    const shareRow = shareResult.rows[0];
    const expiresAt = shareRow.expires_at as number;
    const shareStatus = shareRow.status as string;
    
    console.log('[updateQuoteResponse] Share status:', shareStatus, 'expires:', expiresAt);
    
    // Check if expired
    if (expiresAt && expiresAt < Math.floor(Date.now() / 1000)) {
      console.log('[updateQuoteResponse] Share expired');
      return false;
    }
    
    // Map action to approval status (question_received doesn't change status)
    const approvalStatusMap: Record<string, string> = {
      'approved': 'CLIENT_APPROVED',
      'rejected': 'CLIENT_REJECTED',
      'requested_changes': 'CLIENT_REQUESTED_CHANGES',
      'question_received': '', // No status change for questions
    };
    
    const newApprovalStatus = approvalStatusMap[action] || '';
    console.log('[updateQuoteResponse] New approval status:', newApprovalStatus || '(no change - question)');
    
    // Update share with response, comment, and timestamp
    try {
      await db.execute({
        sql: `UPDATE calculation_shares 
              SET status = ?,
                  client_response = ?,
                  client_comment = ?,
                  responded_at = ?
              WHERE calculation_id = ? AND token = ?`,
        args: [
          action === 'approved' ? 'responded' : 'active',
          action,
          comment || null,
          Math.floor(Date.now() / 1000),
          calculationId,
          token
        ]
      });
      console.log('[updateQuoteResponse] Share status updated with comment');
    } catch (shareUpdateError) {
      console.error('[updateQuoteResponse] Error updating share status:', shareUpdateError);
      // Continue anyway - the main goal is to update the calculation status
    }
    
    // Update calculation approval status via EAV (only if status needs to change)
    if (newApprovalStatus) {
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
    
    console.log('[updateQuoteResponse] Entity result:', JSON.stringify(entityResult.rows));
    
    if (entityResult.rows.length > 0) {
      const entityId = entityResult.rows[0].entityId as string;
      console.log('[updateQuoteResponse] Found entity:', entityId);
      
      // Check if approvalStatus attribute exists
      const existingAttr = await db.execute({
        sql: `SELECT id FROM attributes 
              WHERE entity_id = ? AND attribute_name = 'approvalStatus'
              LIMIT 1`,
        args: [entityId]
      });
      
      console.log('[updateQuoteResponse] Existing attr count:', existingAttr.rows.length);
      
      if (existingAttr.rows.length > 0) {
        // Update existing attribute
        await db.execute({
          sql: `UPDATE attributes SET string_value = ? 
                WHERE entity_id = ? AND attribute_name = 'approvalStatus'`,
          args: [newApprovalStatus, entityId]
        });
        console.log('[updateQuoteResponse] Updated existing approvalStatus');
      } else {
        // Insert new attribute with all required fields
        const attrId = crypto.randomUUID();
        await db.execute({
          sql: `INSERT INTO attributes (id, entity_id, attribute_name, value_type, string_value, created_at)
                VALUES (?, ?, 'approvalStatus', 'string', ?, ?)`,
          args: [attrId, entityId, newApprovalStatus, Math.floor(Date.now() / 1000)]
        });
        console.log('[updateQuoteResponse] Inserted new approvalStatus');
      }
    } else {
      console.log('[updateQuoteResponse] No entity found for calculation');
      }
    } else {
      console.log('[updateQuoteResponse] Skipping status update (question only)');
    }
    
    // Create activity log entry directly in database
    try {
      // Get organization_id from the share
      const orgResult = await db.execute({
        sql: `SELECT organization_id FROM calculation_shares WHERE calculation_id = ? AND token = ? LIMIT 1`,
        args: [calculationId, token]
      });
      const organizationId = orgResult.rows[0]?.organization_id as string | null;
      
      // Map action to activity description
      let activityAction: string;
      let description: string;
      switch (action) {
        case 'approved':
          activityAction = 'client_approved';
          description = 'Klient schválil ponuku';
          break;
        case 'rejected':
          activityAction = 'client_rejected';
          description = 'Klient zamietol ponuku';
          break;
        case 'requested_changes':
          activityAction = 'client_requested_changes';
          description = `Klient požiadal o zmeny: "${comment || "(bez textu)"}"`;
          break;
        default:
          activityAction = 'question_received';
          description = `Klient položil otázku: "${comment || "(bez textu)"}"`;
      }
      
      const activityId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      
      await db.execute({
        sql: `INSERT INTO calculation_activities (id, calculation_id, action, description, metadata, organization_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          activityId,
          calculationId,
          activityAction,
          description,
          JSON.stringify({ comment: comment || null, respondedAt: new Date().toISOString() }),
          organizationId,
          now
        ]
      });
      console.log('[updateQuoteResponse] Activity created directly:', activityAction);
    } catch (activityError) {
      console.error('[updateQuoteResponse] Failed to create activity:', activityError);
      // Don't fail - activity is nice to have
    }
    
    // Send webhook notification to main app (for email notifications - backup)
    try {
      const webhookUrl = import.meta.env.PUBLIC_MAIN_APP_URL || 'https://business-flow-ai.up.railway.app';
      console.log('[updateQuoteResponse] Sending webhook to:', `${webhookUrl}/api/webhooks/quote-response`);
      
      const webhookResponse = await fetch(`${webhookUrl}/api/webhooks/quote-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculationId,
          token,
          action,
          comment: comment || null,
          respondedAt: new Date().toISOString()
        })
      });
      
      const webhookText = await webhookResponse.text();
      console.log('[updateQuoteResponse] Webhook response:', webhookResponse.status, webhookText.substring(0, 200));
    } catch (webhookError) {
      console.error('[updateQuoteResponse] Failed to send webhook (non-blocking):', webhookError);
      // Don't fail the whole operation if webhook fails
    }
    
    console.log('[updateQuoteResponse] SUCCESS');
    return true;
  } catch (error) {
    console.error('[updateQuoteResponse] ERROR:', error);
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
      
      items.push({
        id: calcId,
        name: data.name || 'Kalkulácia',
        description: data.description || null,
        totalPrice: Number(data.actualTotalPrice || data.totalPrice) || null,
        shareUrl: itemToken ? `/quote/${calcId}/${itemToken}` : null,
      });
    }
    
    // Get organization data if available
    let organization: QuoteBundleData['organization'] = null;
    if (organizationId) {
      const orgResult = await db.execute({
        sql: `SELECT name, metadata FROM organization WHERE id = ? LIMIT 1`,
        args: [organizationId]
      });
      
      if (orgResult.rows.length > 0) {
        const orgRow = orgResult.rows[0];
        // Parse metadata for additional org info
        let metadata: any = {};
        if (orgRow.metadata) {
          try {
            metadata = typeof orgRow.metadata === 'string' ? JSON.parse(orgRow.metadata) : orgRow.metadata;
          } catch { /* ignore */ }
        }
        
        organization = {
          name: orgRow.name as string,
          email: metadata.email || null,
          phone: metadata.phone || null,
          address: metadata.address || null,
          ico: metadata.ico || null,
          vatRate: metadata.vatRate || metadata.vat_rate || 23,
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

// Get customer rating data
export async function getCustomerRating(customerId: string): Promise<CustomerRating | null> {
  try {
    const db = getClient();
    const result = await db.execute({
      sql: `
        SELECT 
          overall_rating as overallRating,
          rating_class as ratingClass,
          risk_level as riskLevel,
          risk_score as riskScore,
          financial_score as financialScore,
          stability_score as stabilityScore,
          rating_recommendation as ratingRecommendation,
          rating_badges as ratingBadges,
          rating_details as ratingDetails,
          rating_last_update as ratingLastUpdate,
          total_revenue as totalRevenue,
          yearly_revenue as yearlyRevenue,
          current_profit as currentProfit,
          payment_discipline_rating as paymentDisciplineRating,
          customer_category as customerCategory
        FROM customers 
        WHERE id = ?
        LIMIT 1
      `,
      args: [customerId]
    });
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    
    // Parse JSON fields
    let ratingBadges: string[] | null = null;
    if (row.ratingBadges) {
      try {
        ratingBadges = typeof row.ratingBadges === 'string' 
          ? JSON.parse(row.ratingBadges as string) 
          : (row.ratingBadges as unknown as string[]);
      } catch { /* ignore */ }
    }
    
    let ratingDetails: CustomerRating['ratingDetails'] = null;
    if (row.ratingDetails) {
      try {
        ratingDetails = typeof row.ratingDetails === 'string' 
          ? JSON.parse(row.ratingDetails as string) 
          : (row.ratingDetails as unknown as CustomerRating['ratingDetails']);
      } catch { /* ignore */ }
    }
    
    return {
      overallScore: row.overallRating ? Number(row.overallRating) : null,
      ratingClass: row.ratingClass as string | null,
      riskLevel: row.riskLevel as string | null,
      riskScore: row.riskScore ? Number(row.riskScore) : null,
      financialScore: row.financialScore ? Number(row.financialScore) : null,
      stabilityScore: row.stabilityScore ? Number(row.stabilityScore) : null,
      ratingRecommendation: row.ratingRecommendation as string | null,
      ratingBadges,
      ratingDetails,
      ratingLastUpdate: row.ratingLastUpdate ? new Date((row.ratingLastUpdate as number) * 1000) : null,
      totalRevenue: row.totalRevenue ? Number(row.totalRevenue) : null,
      yearlyRevenue: row.yearlyRevenue ? Number(row.yearlyRevenue) : null,
      currentProfit: row.currentProfit ? Number(row.currentProfit) : null,
      paymentDisciplineRating: row.paymentDisciplineRating as string | null,
      customerCategory: row.customerCategory as string | null,
    };
  } catch (error) {
    console.error('Error getting customer rating:', error);
    return null;
  }
}

// Global Client Rating from Pricing Rules (Tools)
export interface GlobalClientRatingRule {
  id: string;
  ratingClass: string;  // 'A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'E'
  multiplier: number;   // 0.82, 0.85, 1, 1.05, etc.
  description: string;  // '10% zľava pre TOP klientov'
  isDefault?: boolean;
}

// Get global client rating rules from pricing configuration
export async function getGlobalClientRatingRules(organizationId: string): Promise<GlobalClientRatingRule[]> {
  try {
    const db = getClient();
    
    // Load from tools table where type = 'global_settings'
    const result = await db.execute({
      sql: `
        SELECT config
        FROM tools 
        WHERE organization_id = ? AND type = 'global_settings'
        LIMIT 1
      `,
      args: [organizationId]
    });
    
    if (result.rows.length === 0) {
      console.log('No global settings found for organization:', organizationId);
      return [];
    }
    
    const configRaw = result.rows[0].config;
    if (!configRaw) return [];
    
    try {
      // Config might be double-escaped JSON (string containing JSON string)
      let config: any = configRaw;
      
      // First parse if it's a string
      if (typeof config === 'string') {
        config = JSON.parse(config);
      }
      
      // Check if result is still a string (double-escaped case)
      if (typeof config === 'string') {
        config = JSON.parse(config);
      }
      
      const globalClientRating = config?.globalClientRating || [];
      console.log('Loaded global client rating rules:', globalClientRating.length);
      return globalClientRating as GlobalClientRatingRule[];
    } catch (parseError) {
      console.error('Error parsing global settings config:', parseError);
      return [];
    }
  } catch (error) {
    console.error('Error getting global client rating rules:', error);
    return [];
  }
}

// Check if database is configured
export function isDatabaseConfigured(): boolean {
  return !!DB_URL;
}

export function getConnectionError(): string | null {
  return connectionError;
}

// ================== CLIENT STATISTICS ==================

export interface ClientStatistics {
  // Spending overview
  totalSpent: number;
  totalOrders: number;
  averageOrderValue: number;
  
  // Monthly spending (last 12 months)
  monthlySpending: {
    month: string;
    year: number;
    amount: number;
    orderCount: number;
  }[];
  
  // Order status breakdown
  orderStatusBreakdown: {
    status: string;
    count: number;
    percentage: number;
  }[];
  
  // Average times
  averageDeliveryDays: number | null;
  averageProductionDays: number | null;
  fastestDeliveryDays: number | null;
  
  // Top products
  topProducts: {
    name: string;
    count: number;
    totalSpent: number;
  }[];
  
  // Recent activity
  lastOrderDate: Date | null;
  ordersThisMonth: number;
  ordersLastMonth: number;
  spendingThisMonth: number;
  spendingLastMonth: number;
}

// Get comprehensive client statistics
export async function getClientStatistics(
  clientEntityId: string,
  clientName: string
): Promise<ClientStatistics> {
  try {
    const db = getClient();
    
    // Default empty stats
    const emptyStats: ClientStatistics = {
      totalSpent: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      monthlySpending: [],
      orderStatusBreakdown: [],
      averageDeliveryDays: null,
      averageProductionDays: null,
      fastestDeliveryDays: null,
      topProducts: [],
      lastOrderDate: null,
      ordersThisMonth: 0,
      ordersLastMonth: 0,
      spendingThisMonth: 0,
      spendingLastMonth: 0,
    };
    
    // Get all orders for this client
    const ordersResult = await db.execute({
      sql: `
        SELECT 
          id, status, total_value, 
          start_date, planned_end_date, actual_end_date,
          created_at
        FROM orders_v2 
        WHERE client_entity_id = ? OR LOWER(client_name) LIKE LOWER(?)
        ORDER BY created_at DESC
      `,
      args: [clientEntityId, `%${clientName}%`]
    });
    
    if (ordersResult.rows.length === 0) return emptyStats;
    
    const orders = ordersResult.rows;
    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, o) => sum + ((o.total_value as number) || 0), 0);
    
    // Calculate monthly spending (last 12 months)
    const monthlyMap = new Map<string, { amount: number; orderCount: number }>();
    const now = new Date();
    
    // Initialize last 12 months
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap.set(key, { amount: 0, orderCount: 0 });
    }
    
    // Fill with actual data
    for (const order of orders) {
      const createdAt = order.created_at as number;
      if (!createdAt) continue;
      
      const date = new Date(createdAt * 1000);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      if (monthlyMap.has(key)) {
        const current = monthlyMap.get(key)!;
        current.amount += (order.total_value as number) || 0;
        current.orderCount += 1;
      }
    }
    
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Máj', 'Jún', 'Júl', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
    const monthlySpending = Array.from(monthlyMap.entries()).map(([key, data]) => {
      const [year, month] = key.split('-').map(Number);
      return {
        month: monthNames[month - 1],
        year,
        amount: data.amount,
        orderCount: data.orderCount,
      };
    });
    
    // Order status breakdown
    const statusCounts = new Map<string, number>();
    for (const order of orders) {
      const status = order.status as string;
      statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    }
    
    const orderStatusBreakdown = Array.from(statusCounts.entries()).map(([status, count]) => ({
      status,
      count,
      percentage: Math.round((count / totalOrders) * 100),
    }));
    
    // Calculate delivery times from order creation to last task before invoicing
    let totalDeliveryDays = 0;
    let totalProductionDays = 0;
    let deliveryCount = 0;
    let productionCount = 0;
    let fastestDelivery = Infinity;
    
    // Get completion times from tasks (last task before FAKTURÁCIA)
    const orderIds = orders.map(o => o.id as string);
    
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      
      // Get last non-invoicing task completion per order
      const taskTimesResult = await db.execute({
        sql: `
          SELECT 
            t.order_id,
            o.created_at as order_created_at,
            o.start_date as order_start_date,
            MAX(t.completed_at) as last_task_completed
          FROM order_tasks_v2 t
          JOIN orders_v2 o ON t.order_id = o.id
          WHERE t.order_id IN (${placeholders})
            AND t.status = 'completed'
            AND t.department_name NOT IN ('FAKTURÁCIA', 'Fakturácia')
          GROUP BY t.order_id, o.created_at, o.start_date
        `,
        args: orderIds
      });
      
      for (const row of taskTimesResult.rows) {
        const orderCreatedAt = row.order_created_at as number;
        const orderStartDate = row.order_start_date as number;
        const lastTaskCompleted = row.last_task_completed as number;
        
        // Production time: from start_date to last task completion
        if (orderStartDate && lastTaskCompleted) {
          const days = Math.round((lastTaskCompleted - orderStartDate) / 86400);
          if (days >= 0) {
            totalProductionDays += days;
            productionCount++;
          }
        }
        
        // Delivery time: from order creation to last task completion (before invoicing)
        if (orderCreatedAt && lastTaskCompleted) {
          const days = Math.round((lastTaskCompleted - orderCreatedAt) / 86400);
          if (days >= 0) {
            totalDeliveryDays += days;
            deliveryCount++;
            if (days < fastestDelivery) fastestDelivery = days;
          }
        }
      }
    }
    
    // Fallback to order dates if no task data
    if (deliveryCount === 0) {
      for (const order of orders) {
        const startDate = order.start_date as number;
        const actualEnd = order.actual_end_date as number;
        const createdAt = order.created_at as number;
        
        if (startDate && actualEnd) {
          const days = Math.round((actualEnd - startDate) / 86400);
          if (days > 0) {
            totalProductionDays += days;
            productionCount++;
          }
        }
        
        if (createdAt && actualEnd) {
          const days = Math.round((actualEnd - createdAt) / 86400);
          if (days > 0) {
            totalDeliveryDays += days;
            deliveryCount++;
            if (days < fastestDelivery) fastestDelivery = days;
          }
        }
      }
    }
    
    // Get top products by DEPARTMENT from order_services (filter out internal departments)
    // orderIds already declared above
    const categoryCounts = new Map<string, { count: number; totalSpent: number }>();
    
    // Internal departments to exclude (not product categories)
    const internalDepartments = [
      'FAKTURÁCIA', 'Fakturácia', 'fakturácia',
      'FINALIZÁCIA / BALENIE', 'Finalizácia / Balenie', 'finalizácia',
      'Neviazane', 'NAKUP-PREDAJ', 'Nakup-predaj',
      'Tlač', 'tlač', 'print', // generic print is internal
      'balenie', 'Balenie', 'BALENIE',
      'dokončovanie', 'Dokončovanie', 'DOKONČOVANIE',
      'Uncategorized', 'uncategorized', 'Ostatné',
    ];
    
    // Department name translations for display
    const deptLabels: Record<string, string> = {
      'Veľkoformátová tlač': 'Veľkoformát',
      'velkoformatova-tlac': 'Veľkoformát',
      'polep áut': 'Polep vozidiel',
      'polep-aut': 'Polep vozidiel',
      'Maloformátová tlač': 'Maloformát',
      'maloformatova-tlac': 'Maloformát',
      'Digitálna tlač': 'Digitálna tlač',
      'PVC': 'PVC produkty',
      'Roll-up': 'Roll-up systémy',
      'Textil': 'Textilná potlač',
      'Svetelná reklama': 'Svetelná reklama',
    };
    
    if (orderIds.length > 0) {
      const placeholders = orderIds.map(() => '?').join(',');
      
      const servicesResult = await db.execute({
        sql: `
          SELECT 
            department_name,
            COUNT(DISTINCT order_id) as order_count,
            SUM(total_price) as total
          FROM order_services 
          WHERE order_id IN (${placeholders})
            AND total_price > 0
          GROUP BY department_name
          ORDER BY total DESC
        `,
        args: orderIds
      });
      
      for (const row of servicesResult.rows) {
        const deptName = row.department_name as string;
        
        // Skip internal departments
        if (internalDepartments.some(d => d.toLowerCase() === deptName.toLowerCase())) {
          continue;
        }
        
        // Get display name
        const displayName = deptLabels[deptName] || deptName;
        const count = row.order_count as number;
        const total = (row.total as number) || 0;
        
        if (categoryCounts.has(displayName)) {
          const existing = categoryCounts.get(displayName)!;
          existing.count += count;
          existing.totalSpent += total;
        } else {
          categoryCounts.set(displayName, { count, totalSpent: total });
        }
      }
    }
    
    // Fallback if no categories found
    if (categoryCounts.size === 0 && orders.length > 0) {
      let totalValue = 0;
      for (const order of orders) {
        totalValue += (order.total_value as number) || 0;
      }
      categoryCounts.set('Zákazky celkom', { count: orders.length, totalSpent: totalValue });
    }
    
    // Sort by total spent and take top 5
    const topProducts = Array.from(categoryCounts.entries())
      .map(([name, data]) => ({ name, count: data.count, totalSpent: data.totalSpent }))
      .sort((a, b) => b.totalSpent - a.totalSpent)
      .slice(0, 5);
    
    // This month / last month stats
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000;
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000;
    
    let ordersThisMonth = 0;
    let ordersLastMonth = 0;
    let spendingThisMonth = 0;
    let spendingLastMonth = 0;
    let lastOrderDate: Date | null = null;
    
    for (const order of orders) {
      const createdAt = order.created_at as number;
      const value = (order.total_value as number) || 0;
      
      if (!lastOrderDate && createdAt) {
        lastOrderDate = new Date(createdAt * 1000);
      }
      
      if (createdAt >= thisMonthStart) {
        ordersThisMonth++;
        spendingThisMonth += value;
      } else if (createdAt >= lastMonthStart && createdAt < thisMonthStart) {
        ordersLastMonth++;
        spendingLastMonth += value;
      }
    }
    
    return {
      totalSpent,
      totalOrders,
      averageOrderValue: totalOrders > 0 ? totalSpent / totalOrders : 0,
      monthlySpending,
      orderStatusBreakdown,
      averageDeliveryDays: deliveryCount > 0 ? Math.round(totalDeliveryDays / deliveryCount) : null,
      averageProductionDays: productionCount > 0 ? Math.round(totalProductionDays / productionCount) : null,
      fastestDeliveryDays: fastestDelivery !== Infinity ? fastestDelivery : null,
      topProducts,
      lastOrderDate,
      ordersThisMonth,
      ordersLastMonth,
      spendingThisMonth,
      spendingLastMonth,
    };
  } catch (error) {
    console.error('Error getting client statistics:', error);
    return {
      totalSpent: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      monthlySpending: [],
      orderStatusBreakdown: [],
      averageDeliveryDays: null,
      averageProductionDays: null,
      fastestDeliveryDays: null,
      topProducts: [],
      lastOrderDate: null,
      ordersThisMonth: 0,
      ordersLastMonth: 0,
      spendingThisMonth: 0,
      spendingLastMonth: 0,
    };
  }
}

// Get calculation activities (questions, responses, status changes)
export interface CalculationActivity {
  id: string;
  action: string;
  description: string;
  comment: string | null;
  createdAt: Date;
}

export async function getCalculationActivities(calculationId: string): Promise<CalculationActivity[]> {
  try {
    const db = getClient();
    
    console.log('[getCalculationActivities] Fetching for calculation:', calculationId);
    
    const result = await db.execute({
      sql: `SELECT id, action, description, metadata, created_at
            FROM calculation_activities
            WHERE calculation_id = ?
            ORDER BY created_at DESC
            LIMIT 50`,
      args: [calculationId]
    });
    
    console.log('[getCalculationActivities] Found:', result.rows.length, 'activities');
    
    return result.rows.map(row => {
      let comment: string | null = null;
      if (row.metadata) {
        try {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : row.metadata;
          comment = meta?.comment || null;
        } catch { /* ignore */ }
      }
      
      return {
        id: row.id as string,
        action: row.action as string,
        description: row.description as string,
        comment,
        createdAt: new Date((row.created_at as number) * 1000),
      };
    });
  } catch (error) {
    console.error('[getCalculationActivities] Error:', error);
    return [];
  }
}

// Client notification for dashboard
export interface ClientNotification {
  id: string;
  type: 'question_sent' | 'status_changed' | 'waiting_for_you';
  title: string;
  message: string;
  calculationId: string;
  calculationName: string;
  createdAt: Date;
  shareToken?: string;
}

// Get notifications for client dashboard
export async function getClientNotifications(
  customerId: string, 
  customerName: string,
  limit: number = 10
): Promise<ClientNotification[]> {
  try {
    const db = getClient();
    
    // Get calculations for this client
    const calcsResult = await getClientCalculations(customerId, customerName, { limit: 50, offset: 0 });
    const calcIds = calcsResult.items.map(c => c.id);
    
    if (calcIds.length === 0) {
      return [];
    }
    
    const notifications: ClientNotification[] = [];
    
    // Check for WAITING_FOR_CLIENT status (needs client action)
    for (const calc of calcsResult.items) {
      if (calc.approvalStatus === 'WAITING_FOR_CLIENT') {
        notifications.push({
          id: `waiting-${calc.id}`,
          type: 'waiting_for_you',
          title: '⏳ Čaká na Vás',
          message: `Prosím dodajte požadované informácie k ponuke "${calc.name}"`,
          calculationId: calc.id,
          calculationName: calc.name,
          createdAt: calc.updatedAt || new Date(),
          shareToken: calc.shareToken || undefined,
        });
      }
      
      // Check for CLIENT_VIEWED status (pending approval)
      if (calc.approvalStatus === 'CLIENT_VIEWED') {
        notifications.push({
          id: `pending-${calc.id}`,
          type: 'status_changed',
          title: '📋 Na schválenie',
          message: `Ponuka "${calc.name}" čaká na Vaše schválenie`,
          calculationId: calc.id,
          calculationName: calc.name,
          createdAt: calc.updatedAt || new Date(),
          shareToken: calc.shareToken || undefined,
        });
      }
    }
    
    // Get recent activities for these calculations
    const placeholders = calcIds.map(() => '?').join(', ');
    const activitiesResult = await db.execute({
      sql: `SELECT id, calculation_id, action, description, metadata, created_at
            FROM calculation_activities
            WHERE calculation_id IN (${placeholders})
            ORDER BY created_at DESC
            LIMIT ?`,
      args: [...calcIds, limit]
    });
    
    for (const row of activitiesResult.rows) {
      const calcId = row.calculation_id as string;
      const calc = calcsResult.items.find(c => c.id === calcId);
      
      if (row.action === 'question_received') {
        let comment = '';
        try {
          const meta = typeof row.metadata === 'string' ? JSON.parse(row.metadata as string) : row.metadata;
          comment = meta?.comment || '';
        } catch { /* ignore */ }
        
        notifications.push({
          id: row.id as string,
          type: 'question_sent',
          title: '✅ Otázka odoslaná',
          message: comment ? `"${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}"` : 'Vaša otázka bola odoslaná',
          calculationId: calcId,
          calculationName: calc?.name || 'Kalkulácia',
          createdAt: new Date((row.created_at as number) * 1000),
          shareToken: calc?.shareToken || undefined,
        });
      }
    }
    
    // Sort by date (newest first) and limit
    return notifications
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  } catch (error) {
    console.error('[getClientNotifications] Error:', error);
    return [];
  }
}

// ============================================================================
// SUPPLIER RFQ - Dopyty na dodávateľov
// ============================================================================

export interface SupplierRfq {
  id: string;
  calculationId: string;
  projectId: string | null;
  supplierEmail: string;
  supplierName: string | null;
  status: 'requested' | 'received' | 'expired';
  dueDate: string | null;
  note: string | null;
  vatRate: number;
  token: string;
  expiresAt: string;
  items: SupplierRfqItem[];
  autoApply: boolean;
  createdAt: string;
  organizationId?: string;
}

export interface SupplierRfqItem {
  itemId: string;
  name: string;
  spec: string | null;
  qty: number;
  unitPrice: number | null;
}

export interface Organization {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  ico?: string;
  vatRate?: number;
}

// Get supplier RFQ by token
export async function getSupplierRfqByToken(token: string): Promise<{ rfq: SupplierRfq; organization: Organization | null } | null> {
  console.log('[getSupplierRfqByToken] Looking for token:', token);
  
  try {
    const db = getClient();
    
    // Find all supplier_requests tables
    const tablesResult = await db.execute({
      sql: `SELECT id, organization_id FROM table_definitions WHERE name = 'supplier_requests'`,
      args: []
    });
    
    console.log('[getSupplierRfqByToken] Found', tablesResult.rows.length, 'supplier_requests tables');
    
    for (const tableRow of tablesResult.rows) {
      const tableId = tableRow.id as string;
      const organizationId = tableRow.organization_id as string;
      console.log('[getSupplierRfqByToken] Checking table:', tableId, 'org:', organizationId);
      
      // Find entities in this table
      const entitiesResult = await db.execute({
        sql: `SELECT e.id as entity_id 
              FROM entities e
              INNER JOIN attributes a ON a.entity_id = e.id
              WHERE e.table_id = ? 
              AND a.attribute_name = 'token' 
              AND a.string_value = ?`,
        args: [tableId, token]
      });
      
      console.log('[getSupplierRfqByToken] Found', entitiesResult.rows.length, 'entities with this token');
      
      if (entitiesResult.rows.length > 0) {
        const entityId = entitiesResult.rows[0].entity_id as string;
        
        // Load all attributes for this entity
        const attrsResult = await db.execute({
          sql: `SELECT attribute_name, string_value, number_value, boolean_value, date_value, json_value
                FROM attributes WHERE entity_id = ?`,
          args: [entityId]
        });
        
        const rfqData: any = { organizationId };
        for (const attr of attrsResult.rows) {
          const name = attr.attribute_name as string;
          let value: any = attr.string_value ?? attr.number_value ?? attr.boolean_value ?? attr.date_value;
          
          // Parse JSON values
          if (attr.json_value) {
            try {
              value = typeof attr.json_value === 'string' ? JSON.parse(attr.json_value) : attr.json_value;
            } catch {
              value = attr.json_value;
            }
          }
          
          rfqData[name] = value;
        }
        
        // Get organization info
        let organization: Organization | null = null;
        const orgResult = await db.execute({
          sql: `SELECT id, name FROM organization WHERE id = ?`,
          args: [organizationId]
        });
        
        if (orgResult.rows.length > 0) {
          organization = {
            id: orgResult.rows[0].id as string,
            name: orgResult.rows[0].name as string,
          };
        }
        
        return { rfq: rfqData as SupplierRfq, organization };
      }
    }
    
    return null;
  } catch (error) {
    console.error('[getSupplierRfqByToken] Error:', error);
    return null;
  }
}

// Submit supplier quote response
export async function submitSupplierQuote(
  token: string,
  items: Array<{
    itemId: string;
    unitPrice: number | null;
    vatRate: number | null;
    leadTimeDays: number | null;
  }>,
  supplierEmail?: string,
  supplierName?: string,
  notes?: string
): Promise<{ success: boolean; quoteId?: string; error?: string }> {
  console.log('[submitSupplierQuote] Starting with token:', token);
  console.log('[submitSupplierQuote] Items count:', items.length);
  
  try {
    const db = getClient();
    console.log('[submitSupplierQuote] DB client obtained');
    
    // Find the RFQ by token
    console.log('[submitSupplierQuote] Looking up RFQ by token...');
    const rfqResult = await getSupplierRfqByToken(token);
    console.log('[submitSupplierQuote] RFQ result:', rfqResult ? 'found' : 'not found');
    
    if (!rfqResult) {
      console.log('[submitSupplierQuote] RFQ not found for token:', token);
      return { success: false, error: 'RFQ not found' };
    }
    
    const { rfq } = rfqResult;
    console.log('[submitSupplierQuote] RFQ ID:', rfq.id, 'orgId:', rfq.organizationId);
    
    // Check expiration
    if (rfq.expiresAt && new Date(rfq.expiresAt).getTime() < Date.now()) {
      console.log('[submitSupplierQuote] RFQ expired at:', rfq.expiresAt);
      return { success: false, error: 'Link expired' };
    }
    
    const organizationId = rfq.organizationId;
    if (!organizationId) {
      console.log('[submitSupplierQuote] No organization ID in RFQ');
      return { success: false, error: 'Organization not found' };
    }
    
    console.log('[submitSupplierQuote] Organization ID:', organizationId);
    
    // Find or create supplier_quotes table
    let quotesTableId: string | null = null;
    const quotesTableResult = await db.execute({
      sql: `SELECT id FROM table_definitions WHERE name = 'supplier_quotes' AND organization_id = ?`,
      args: [organizationId]
    });
    
    if (quotesTableResult.rows.length > 0) {
      quotesTableId = quotesTableResult.rows[0].id as string;
    } else {
      // Create table
      quotesTableId = crypto.randomUUID();
      await db.execute({
        sql: `INSERT INTO table_definitions (id, name, organization_id, description, created_at)
              VALUES (?, 'supplier_quotes', ?, 'Supplier responses to RFQs', datetime('now'))`,
        args: [quotesTableId, organizationId]
      });
    }
    
    // Create entity for quote
    const quoteId = crypto.randomUUID();
    const entityUUID = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    
    console.log('[submitSupplierQuote] Creating entity:', entityUUID, 'for quote:', quoteId);
    
    await db.execute({
      sql: `INSERT INTO entities (id, table_id, entity_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
      args: [entityUUID, quotesTableId, quoteId, now, now]
    });
    
    console.log('[submitSupplierQuote] Entity created successfully');
    
    // Insert attributes
    const quoteData = {
      id: quoteId,
      requestId: rfq.id,
      supplierEmail: supplierEmail || rfq.supplierEmail || null,
      supplierName: supplierName || rfq.supplierName || null,
      status: 'received',
      notes: notes || null,
      submittedAt: new Date().toISOString(),
    };
    
    console.log('[submitSupplierQuote] Inserting attributes...');
    
    for (const [key, value] of Object.entries(quoteData)) {
      if (value !== null && value !== undefined) {
        const attrId = crypto.randomUUID();
        await db.execute({
          sql: `INSERT INTO attributes (id, entity_id, attribute_name, value_type, string_value, created_at) VALUES (?, ?, ?, 'string', ?, ?)`,
          args: [attrId, entityUUID, key, String(value), now]
        });
      }
    }
    
    // Store items as JSON attribute
    const itemsAttrId = crypto.randomUUID();
    await db.execute({
      sql: `INSERT INTO attributes (id, entity_id, attribute_name, value_type, json_value, created_at) VALUES (?, ?, 'items', 'json', ?, ?)`,
      args: [itemsAttrId, entityUUID, JSON.stringify(items), now]
    });
    
    console.log('[submitSupplierQuote] All attributes inserted successfully');
    
    // Auto-apply to calculation if enabled
    if (rfq.autoApply && rfq.calculationId) {
      try {
        await applySupplierQuoteToCalculation(rfq.calculationId, organizationId, items, quoteId, supplierEmail, supplierName);
      } catch (err) {
        console.error('[submitSupplierQuote] Auto-apply failed:', err);
      }
    }
    
    return { success: true, quoteId };
  } catch (error) {
    console.error('[submitSupplierQuote] Error:', error);
    return { success: false, error: 'Internal error' };
  }
}

// Apply supplier quote prices to calculation
async function applySupplierQuoteToCalculation(
  calculationId: string,
  organizationId: string,
  items: Array<{ itemId: string; unitPrice: number | null; vatRate: number | null; leadTimeDays: number | null }>,
  quoteId: string,
  supplierEmail?: string,
  supplierName?: string
): Promise<void> {
  const db = getClient();
  
  // Find calculations table
  const calcTableResult = await db.execute({
    sql: `SELECT id FROM table_definitions WHERE name = 'calculations' AND organization_id = ?`,
    args: [organizationId]
  });
  
  if (calcTableResult.rows.length === 0) return;
  
  const calcTableId = calcTableResult.rows[0].id as string;
  
  // Find calculation entity
  const calcEntityResult = await db.execute({
    sql: `SELECT e.id as entity_id
          FROM entities e
          INNER JOIN attributes a ON a.entity_id = e.id
          WHERE e.table_id = ?
          AND a.attribute_name = 'id'
          AND a.string_value = ?`,
    args: [calcTableId, calculationId]
  });
  
  if (calcEntityResult.rows.length === 0) return;
  
  const entityId = calcEntityResult.rows[0].entity_id as string;
  
  // Get calculationData attribute
  const calcDataResult = await db.execute({
    sql: `SELECT id, json_value FROM attributes WHERE entity_id = ? AND attribute_name = 'calculationData'`,
    args: [entityId]
  });
  
  if (calcDataResult.rows.length === 0) return;
  
  let calculationData: any = {};
  try {
    const raw = calcDataResult.rows[0].json_value;
    calculationData = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return;
  }
  
  // Apply prices to products/materials/services
  const applyToCollection = (collectionName: 'products' | 'materials' | 'services') => {
    const collection = Array.isArray(calculationData[collectionName]) ? calculationData[collectionName] : [];
    calculationData[collectionName] = collection.map((item: any) => {
      const match = items.find(qi => qi.itemId === item.id || qi.itemId === item.product?.id);
      if (!match) return item;
      
      return {
        ...item,
        variant: item.variant ? {
          ...item.variant,
          purchaseBasePrice: match.unitPrice ?? item.variant.purchaseBasePrice ?? null,
        } : item.variant,
        purchase: {
          ...(item.purchase || {}),
          type: 'supplier',
          status: 'selected',
          selectedQuoteId: quoteId,
          cost: {
            unitPrice: match.unitPrice ?? null,
            currency: 'EUR',
            vatRate: match.vatRate ?? 20,
          },
          leadTimeDays: match.leadTimeDays ?? null,
          supplierInfo: {
            name: supplierName || null,
            email: supplierEmail || null,
          },
        },
      };
    });
  };
  
  applyToCollection('products');
  applyToCollection('materials');
  applyToCollection('services');
  
  // Update calculationData attribute
  const attrId = calcDataResult.rows[0].id as string;
  await db.execute({
    sql: `UPDATE attributes SET json_value = ? WHERE id = ?`,
    args: [JSON.stringify(calculationData), attrId]
  });
  
  // Update updatedAt
  await db.execute({
    sql: `UPDATE attributes SET string_value = ? WHERE entity_id = ? AND attribute_name = 'updatedAt'`,
    args: [new Date().toISOString(), entityId]
  });
  
  console.log('[applySupplierQuoteToCalculation] Applied supplier prices to calculation:', calculationId);
}
