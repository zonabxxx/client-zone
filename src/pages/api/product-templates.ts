import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/session';
import { getClient } from '../../lib/db';

// API URL of the main business-flow-ai application
// Hardcode localhost:3000 for development - business-flow-ai server
const API_BASE_URL = 'http://localhost:3000';
const API_KEY = import.meta.env.BUSINESS_FLOW_API_KEY || '';

// Helper to get entityId from customers table if not in session
async function getClientEntityId(session: { customerId: string; customerEntityId?: string }): Promise<string> {
  // If we have customerEntityId in session, use it
  if (session.customerEntityId) {
    return session.customerEntityId;
  }
  
  // Otherwise, lookup in database
  try {
    const db = getClient();
    const result = await db.execute({
      sql: 'SELECT entity_id FROM customers WHERE id = ?',
      args: [session.customerId]
    });
    
    if (result.rows.length > 0 && result.rows[0].entity_id) {
      return result.rows[0].entity_id as string;
    }
  } catch (error) {
    console.error('[PRODUCT-TEMPLATES] Error fetching entityId:', error);
  }
  
  // Fallback to customerId
  return session.customerId;
}

export const GET: APIRoute = async ({ request, url }) => {
  // Check authentication
  const session = getSessionFromCookie(request.headers.get('cookie'));
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    // Get query params
    const search = url.searchParams.get('search') || '';
    const categoryId = url.searchParams.get('categoryId') || '';
    const favoritesOnly = url.searchParams.get('favoritesOnly') || '';
    const page = url.searchParams.get('page') || '1';
    const pageSize = url.searchParams.get('pageSize') || '20';

    // Get the correct entityId for filtering
    const clientEntityId = await getClientEntityId(session);

    // Build query string
    const queryParams = new URLSearchParams({
      organizationId: session.organizationId,
      clientEntityId, // entityId klienta pre obľúbené produkty a filtrovanie
      page,
      pageSize,
    });

    if (search) queryParams.append('search', search);
    if (categoryId) queryParams.append('categoryId', categoryId);
    if (favoritesOnly === 'true') queryParams.append('favoritesOnly', 'true');

    // Log for debugging
    const fetchUrl = `${API_BASE_URL}/api/public/v1/product-templates?${queryParams.toString()}`;
    console.log('[PRODUCT-TEMPLATES] Session customerId:', session.customerId, 'customerEntityId:', (session as any).customerEntityId);
    console.log('[PRODUCT-TEMPLATES] Using clientEntityId:', clientEntityId);
    console.log('[PRODUCT-TEMPLATES] Fetching from:', fetchUrl);

    // Fetch from main API
    const response = await fetch(
      fetchUrl,
      {
        headers: {
          'X-API-Key': API_KEY,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PRODUCT-TEMPLATES] API error:', response.status, errorText);
      return new Response(JSON.stringify({ error: 'Failed to fetch product templates' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[PRODUCT-TEMPLATES] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
