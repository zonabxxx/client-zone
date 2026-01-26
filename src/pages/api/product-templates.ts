import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../lib/session';

// API URL of the main business-flow-ai application
const API_BASE_URL = import.meta.env.BUSINESS_FLOW_API_URL || 'https://business-flow-ai.up.railway.app';
const API_KEY = import.meta.env.BUSINESS_FLOW_API_KEY || '';

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
    const page = url.searchParams.get('page') || '1';
    const pageSize = url.searchParams.get('pageSize') || '20';

    // Build query string
    const queryParams = new URLSearchParams({
      organizationId: session.organizationId,
      page,
      pageSize,
    });

    if (search) queryParams.append('search', search);
    if (categoryId) queryParams.append('categoryId', categoryId);

    // Fetch from main API
    const response = await fetch(
      `${API_BASE_URL}/api/public/v1/product-templates?${queryParams.toString()}`,
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
