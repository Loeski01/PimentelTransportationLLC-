'use strict';
/**
 * Read-only operational summary of booking modification notifications.
 * No external connections or messages are initiated by this module.
 * Monitoring should alert an operator through a separately configured channel.
 */
async function notificationHealth({client}) {
 if(!client || typeof client.query!=='function') throw new TypeError('Database client required');
 const result=await client.query(`
   SELECT
     COUNT(*) FILTER (WHERE status='failed')::int AS failed,
     COUNT(*) FILTER (WHERE status='sending' AND created_at < now()-interval '15 minutes')::int AS possibly_stuck,
     COUNT(*) FILTER (WHERE status IN ('pending','retry') AND next_attempt_at <= now())::int AS due,
     COUNT(*) FILTER (WHERE status='accepted')::int AS accepted
   FROM pt_booking_notification_outbox`);
 const row=result.rows[0]||{};
 return {
   failed:Number(row.failed||0),possiblyStuck:Number(row.possibly_stuck||0),
   due:Number(row.due||0),accepted:Number(row.accepted||0),
   needsOperatorAttention:Number(row.failed||0)>0||Number(row.possibly_stuck||0)>0
 };
}
module.exports={notificationHealth};
