"use strict";
async function ensureJourneySchema(pool){
 const database=await pool.query("SELECT current_database() AS name");
 if(database.rows[0]?.name!=="pimentel_dispatch_dev")throw Error("Unexpected driver journey database");
 await pool.query("ALTER TABLE assignments ADD COLUMN IF NOT EXISTS trip_stage VARCHAR(24) NOT NULL DEFAULT 'not_started' CHECK(trip_stage IN ('not_started','on_the_way','arrived','passenger_onboard','completed'))");
 await pool.query("UPDATE assignments a SET trip_stage='on_the_way' FROM bookings b WHERE b.id=a.booking_id AND a.status='accepted' AND b.status='in_progress' AND a.trip_stage='not_started'");
 await pool.query("UPDATE assignments SET trip_stage='completed' WHERE status='completed' AND trip_stage='not_started'");
}
module.exports={ensureJourneySchema};
