import type { APIRoute } from 'astro';
import { getClientCalculations, getProjectCalculations } from '../../lib/db';
import { getSessionFromCookie } from '../../lib/session';

export const GET: APIRoute = async ({ request }) => {
  const session = getSessionFromCookie(request.headers.get('cookie'));
  
  if (!session) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const projectId = url.searchParams.get('projectId');
  
  try {
    let result;
    
    if (projectId) {
      // Lazy load calculations for a specific project
      result = await getProjectCalculations(projectId, { limit, offset });
    } else {
      // Get all client calculations
      result = await getClientCalculations(session.customerId, session.customerName, { limit, offset });
    }
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('API error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
