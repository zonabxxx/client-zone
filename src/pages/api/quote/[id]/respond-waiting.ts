import type { APIRoute } from 'astro';
import { getSessionFromCookie } from '../../../../lib/session';
import { getClient } from '../../../../lib/db';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const { id } = params; // calculationId
  
  if (!id) {
    return new Response('Missing calculation ID', { status: 400 });
  }

  // Check authentication
  const session = getSessionFromCookie(request.headers.get('cookie'));
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Parse form data
  const formData = await request.formData();
  const comment = formData.get('comment') as string | null;
  
  if (!comment || !comment.trim()) {
    return redirect(`/dashboard?error=empty_response`, 303);
  }
  
  try {
    const db = getClient();
    
    // Find the share for this calculation
    const shareResult = await db.execute({
      sql: `SELECT id, token FROM calculation_shares 
            WHERE calculation_id = ? AND status = 'active'
            ORDER BY created_at DESC LIMIT 1`,
      args: [id]
    });
    
    const share = shareResult.rows[0];
    if (!share) {
      console.error('[respond-waiting] No active share found for calculation:', id);
      return redirect(`/dashboard?error=no_share`, 303);
    }
    
    const token = share.token as string;
    
    // Update the share with the client response
    await db.execute({
      sql: `UPDATE calculation_shares 
            SET client_response = 'question_received',
                client_comment = ?,
                responded_at = ?
            WHERE id = ?`,
      args: [comment.trim(), Math.floor(Date.now() / 1000), share.id]
    });
    
    console.log('[respond-waiting] Updated share with response');
    
    // Create activity log entry directly
    try {
      const orgResult = await db.execute({
        sql: `SELECT organization_id FROM calculation_shares WHERE id = ? LIMIT 1`,
        args: [share.id]
      });
      const organizationId = orgResult.rows[0]?.organization_id as string | null;
      
      const activityId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      
      await db.execute({
        sql: `INSERT INTO calculation_activities (id, calculation_id, action, description, metadata, organization_id, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          activityId,
          id,
          'question_received',
          `Klient položil otázku: "${comment.trim()}"`,
          JSON.stringify({ comment: comment.trim(), respondedAt: new Date().toISOString(), clientName: session.customerName }),
          organizationId,
          now
        ]
      });
      console.log('[respond-waiting] Activity created directly');
    } catch (activityError) {
      console.error('[respond-waiting] Failed to create activity:', activityError);
    }
    
    // Send webhook notification to main app (backup for email notifications)
    try {
      const webhookUrl = import.meta.env.PUBLIC_MAIN_APP_URL || 'https://business-flow-ai.up.railway.app';
      const webhookResponse = await fetch(`${webhookUrl}/api/webhooks/quote-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          calculationId: id,
          token: token,
          action: 'question_received',
          comment: comment.trim(),
          respondedAt: new Date().toISOString(),
          clientName: session.customerName
        })
      });
      
      if (!webhookResponse.ok) {
        console.error('[respond-waiting] Webhook failed:', await webhookResponse.text());
      } else {
        console.log('[respond-waiting] Webhook notification sent successfully');
      }
    } catch (webhookError) {
      console.error('[respond-waiting] Webhook error (non-blocking):', webhookError);
    }
    
    // Redirect back to dashboard with success message
    return redirect(`/dashboard?success=response_sent`, 303);
  } catch (error) {
    console.error('[respond-waiting] Error:', error);
    return redirect(`/dashboard?error=server_error`, 303);
  }
};
