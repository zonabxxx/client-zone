import type { APIRoute } from 'astro';
import { findCustomerByEmail, isDatabaseConfigured } from '../../../lib/db';
import { createSessionCookie } from '../../../lib/session';

export const POST: APIRoute = async ({ request }) => {
  try {
    // Check if database is configured
    if (!isDatabaseConfigured()) {
      return new Response(
        JSON.stringify({ 
          error: 'Databáza nie je nakonfigurovaná. Kontaktujte administrátora.',
          details: 'Chýba DB_URL environment variable'
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Email je povinný' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Find customer by email (now async)
    const customer = await findCustomerByEmail(email.trim().toLowerCase());

    if (!customer) {
      return new Response(
        JSON.stringify({ error: 'Email nebol nájdený v našej databáze. Kontaktujte prosím podporu.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create session
    const sessionCookie = createSessionCookie({
      customerId: customer.id,
      customerEntityId: customer.entityId, // entityId for product template matching
      customerName: customer.name,
      email: email.trim().toLowerCase(),
      organizationId: customer.organizationId,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Prihlásenie úspešné',
        customer: {
          name: customer.name,
          businessName: customer.businessName,
        }
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Set-Cookie': sessionCookie,
        } 
      }
    );
  } catch (error) {
    console.error('Login error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Neznáma chyba';
    return new Response(
      JSON.stringify({ 
        error: 'Nastala chyba pri prihlásení', 
        details: errorMessage 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
