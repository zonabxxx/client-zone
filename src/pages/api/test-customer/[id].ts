import type { APIRoute } from 'astro';
import { getCustomerById } from '../../../lib/db';

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'Missing id' }), { status: 400 });
  }

  try {
    const customer = await getCustomerById(id);
    
    if (!customer) {
      return new Response(JSON.stringify({ 
        error: 'Customer not found',
        searchedId: id 
      }), { status: 404 });
    }

    return new Response(JSON.stringify({
      success: true,
      customer: {
        id: customer.id,
        entityId: customer.entityId,
        name: customer.name,
        billingStreet: customer.billingStreet,
        billingCity: customer.billingCity,
        billingPostalCode: customer.billingPostalCode,
        billingCountry: customer.billingCountry,
        corrStreet: customer.corrStreet,
        corrCity: customer.corrCity,
        ico: customer.ico,
        dic: customer.dic,
        icDph: customer.icDph,
        email: customer.email,
        contactEmail: customer.contactEmail,
      }
    }), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Database error',
      details: error instanceof Error ? error.message : 'Unknown'
    }), { status: 500 });
  }
};
