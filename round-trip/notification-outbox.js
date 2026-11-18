'use strict';
/**
 * Process one pending notification using an injected database client and mail sender.
 * Never sends mail unless invoked by an explicitly configured worker.
 * A successful provider response means accepted for delivery, not delivered.
 */
async function deliverBookingNotification({client,eventId,send}) {
  if (!client || typeof client.query !== 'function' || typeof send !== 'function')
    throw new TypeError('Database client and mail sender required');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(eventId)))
    throw new RangeError('Invalid event ID');
  // Claim atomically to avoid duplicate concurrent sends.
  const claim=await client.query(
    `UPDATE pt_booking_notification_outbox SET status='sending',attempts=attempts+1
     WHERE event_id=$1 AND status IN ('pending','retry') AND next_attempt_at<=now()
     RETURNING event_id,recipient_email,attempts`,[eventId]);
  if(claim.rowCount!==1) return {claimed:false};
  const item=claim.rows[0];
  try {
    const result=await send({eventId,recipientEmail:item.recipient_email});
    if (!result || result.accepted !== true) throw new Error('Mail provider did not accept message');
    await client.query(
      `UPDATE pt_booking_notification_outbox SET status='accepted',accepted_at=now(),last_error=NULL
       WHERE event_id=$1 AND status='sending'`,[eventId]);
    return {claimed:true,accepted:true};
  } catch(err) {
    await client.query(
      `UPDATE pt_booking_notification_outbox
       SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'retry' END,
           next_attempt_at=now()+interval '5 minutes',last_error=$2
       WHERE event_id=$1 AND status='sending'`,[eventId,String(err.message||err).slice(0,500)]);
    return {claimed:true,accepted:false,retryQueued:true};
  }
}
module.exports={deliverBookingNotification};
