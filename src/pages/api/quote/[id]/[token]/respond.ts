import type { APIRoute } from 'astro';
import { updateQuoteResponse } from '../../../../../lib/db';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id, token } = params;
  
  if (!id || !token) {
    return new Response('Missing parameters', { status: 400 });
  }
  
  // Parse form data
  const formData = await request.formData();
  const action = formData.get('action') as 'approved' | 'rejected' | 'requested_changes';
  const comment = formData.get('comment') as string | null;
  
  if (!action || !['approved', 'rejected', 'requested_changes'].includes(action)) {
    return new Response('Invalid action', { status: 400 });
  }
  
  // Update the quote response in database
  const success = await updateQuoteResponse(id, token, action, comment || undefined);
  
  if (!success) {
    return new Response('Failed to update quote', { status: 500 });
  }
  
  // Redirect back to the quote page with success message
  return redirect(`/quote/${id}/${token}?responded=${action}`, 303);
};
