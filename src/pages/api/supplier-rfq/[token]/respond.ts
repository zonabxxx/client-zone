import type { APIRoute } from 'astro';
import { submitSupplierQuote } from '../../../../lib/db';

export const POST: APIRoute = async ({ params, request }) => {
  const token = params.token;
  console.log('[supplier-rfq respond] Token:', token);
  
  try {
    if (!token) {
      console.log('[supplier-rfq respond] No token provided');
      return new Response(JSON.stringify({ error: 'Token required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse form data or JSON
    const contentType = request.headers.get('content-type') || '';
    console.log('[supplier-rfq respond] Content-Type:', contentType);
    
    let items: Array<{
      itemId: string;
      unitPrice: number | null;
      vatRate: number | null;
      leadTimeDays: number | null;
    }> = [];
    let supplierEmail: string | undefined;
    let supplierName: string | undefined;
    let notes: string | undefined;

    if (contentType.includes('application/json')) {
      const body = await request.json();
      items = body.items || [];
      supplierEmail = body.supplierEmail;
      supplierName = body.supplierName;
      notes = body.notes;
    } else {
      // Parse form data
      const formData = await request.formData();
      const byIndex: Record<string, any> = {};
      
      for (const [key, value] of formData.entries()) {
        const match = key.match(/^items\[(\d+)\]\[(.+)\]$/);
        if (match) {
          const idx = match[1];
          const field = match[2];
          if (!byIndex[idx]) byIndex[idx] = {};
          byIndex[idx][field] = typeof value === 'string' ? value : String(value);
        } else if (key === 'supplierEmail') {
          supplierEmail = String(value);
        } else if (key === 'supplierName') {
          supplierName = String(value);
        } else if (key === 'notes') {
          notes = String(value);
        }
      }
      
      items = Object.values(byIndex).map((o: any) => ({
        itemId: o.itemId || null,
        unitPrice: o.unitPrice ? parseFloat(o.unitPrice) : null,
        vatRate: o.vatRate ? parseFloat(o.vatRate) : null,
        leadTimeDays: o.leadTimeDays ? parseInt(o.leadTimeDays, 10) : null,
      }));
    }

    console.log('[supplier-rfq respond] Items parsed:', items.length);
    console.log('[supplier-rfq respond] Items:', JSON.stringify(items));

    if (items.length === 0) {
      console.log('[supplier-rfq respond] No items');
      return new Response(JSON.stringify({ error: 'No items submitted' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Submit the quote
    console.log('[supplier-rfq respond] Submitting quote...');
    const result = await submitSupplierQuote(
      token,
      items,
      supplierEmail,
      supplierName,
      notes
    );
    console.log('[supplier-rfq respond] Result:', JSON.stringify(result));

    if (!result.success) {
      console.log('[supplier-rfq respond] Failed:', result.error);
      // If form submission, redirect with error
      if (!contentType.includes('application/json')) {
        const errorUrl = `/supplier-rfq/${token}?error=${encodeURIComponent(result.error || 'unknown')}`;
        console.log('[supplier-rfq respond] Redirecting to:', errorUrl);
        return new Response(null, {
          status: 303,
          headers: { 'Location': errorUrl }
        });
      }
      
      return new Response(JSON.stringify({ error: result.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Success - redirect for form or return JSON
    if (!contentType.includes('application/json')) {
      const successUrl = `/supplier-rfq/${token}?submitted=1`;
      console.log('[supplier-rfq respond] Success! Redirecting to:', successUrl);
      return new Response(null, {
        status: 303,
        headers: { 'Location': successUrl }
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      quoteId: result.quoteId 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('[supplier-rfq respond] Exception:', error);
    
    // For form submissions, redirect with error
    if (token) {
      return new Response(null, {
        status: 303,
        headers: { 'Location': `/supplier-rfq/${token}?error=exception` }
      });
    }
    
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
