// Isolated dispatch router. NOT mounted in the production payments server.
// Requires express and a configured PostgreSQL 'db' adapter (node-postgres Pool).
// Admin authentication is intentionally NOT implemented here: routes must be
// mounted only after verified admin session middleware is installed.
const express = require('express');
const { bostonPickupTime } = require('./boston-pickup-time');
// An audit entry also keeps the archived record out of operational queues.
const notArchived = tripId => `NOT EXISTS (
  SELECT 1 FROM dispatch_trip_audit archived
  WHERE archived.trip_id=${tripId} AND archived.actor_role='admin' AND archived.action='archived'
)`;
const editableTripStatuses = ['pending', 'approved', 'assigned', 'accepted'];
const validTripText = text => typeof text === 'string' && text.trim().length > 0 && text.trim().length <= 250;
const validTripPhone = phone => !phone || /^\+[1-9][0-9]{7,14}$/.test(phone);
function createDispatchRouter({db, requireAdmin, requireDriver}) {
  if (!db || !requireAdmin || !requireDriver) throw new Error('Missing dispatch security dependencies');
  const router = express.Router();
  // A trip update and its audit record must commit together.
  async function updateAndAudit(sql,params,actorRole,actorId,action){
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      const q=await client.query(sql,params);
      if(q.rowCount)await client.query('INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,actorRole,String(actorId),action]);
      await client.query('COMMIT');
      return q;
    }catch(e){await client.query('ROLLBACK');throw e}
    finally{client.release()}
  }
  // Admin-only queue; fare data is deliberately never exposed in driver endpoints.
  router.get('/admin/trips',requireAdmin,async(req,res,next)=>{
    try {
      const q=await db.query(`SELECT id,passenger_surname,passenger_phone,pickup_address,destination_address,pickup_at,on_my_way_at,arrived_at,fare_cents,driver_id,status,updated_at::text AS edit_version,change_revision,changed_fields,change_seen_at FROM dispatch_trips WHERE ${notArchived("dispatch_trips.id")} ORDER BY pickup_at DESC LIMIT 100`);
      res.json(q.rows);
    } catch(e){next(e)}
  });
  // Administrator-only completed-trip cleanup; disabled until backup restoration is verified.
  router.get('/admin/trips/completed-cleanup-preview',requireAdmin,async(req,res,next)=>{
    try{
      const q=await db.query("SELECT id FROM dispatch_trips WHERE status='completed' ORDER BY id");
      res.set('Cache-Control','no-store').json({count:q.rowCount,ids:q.rows.map(r=>String(r.id)),enabled:process.env.DISPATCH_COMPLETED_DELETE_ENABLED==='yes'});
    }catch(e){next(e)}
  });
  router.post('/admin/trips/completed-cleanup',requireAdmin,async(req,res,next)=>{
    if(process.env.DISPATCH_COMPLETED_DELETE_ENABLED!=='yes')return res.status(403).json({error:'Cleanup disabled until verified backup restore'});
    const ids=req.body?.ids;
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(x=>typeof x!=='string'||!/^[1-9][0-9]*$/.test(x))||new Set(ids).size!==ids.length)return res.status(400).json({error:'Invalid completed trip selection'});
    const client=await db.connect();
    try{
      await client.query('BEGIN');
      await client.query("SELECT pg_advisory_xact_lock(76340211)");
      const q=await client.query("SELECT id FROM dispatch_trips WHERE status='completed' ORDER BY id FOR UPDATE");
      const actual=q.rows.map(r=>String(r.id));
      if(actual.length!==ids.length||actual.some((id,i)=>id!==ids[i])){await client.query('ROLLBACK');return res.status(409).json({error:'Completed trips changed; refresh and confirm again'});}
      await client.query('DELETE FROM dispatch_admin_notifications WHERE trip_id=ANY($1::bigint[])',[ids]);
      await client.query('DELETE FROM dispatch_trip_audit WHERE trip_id=ANY($1::bigint[])',[ids]);
      const deleted=await client.query("DELETE FROM dispatch_trips WHERE status='completed' AND id=ANY($1::bigint[])",[ids]);
      if(deleted.rowCount!==ids.length)throw Error('Cleanup count mismatch');
      await client.query('COMMIT');
      res.set('Cache-Control','no-store').json({deletedTrips:deleted.rowCount});
    }catch(e){await client.query('ROLLBACK').catch(()=>{});next(e)}
    finally{client.release()}
  });
  // Admin-only driver enrollment; only a salted hash of the four-digit PIN is stored.
  router.post('/admin/drivers',requireAdmin,async(req,res,next)=>{
    try {
      const {displayName,pin}=req.body||{};
      if(typeof displayName!=='string'||!displayName.trim()||displayName.trim().length>100||typeof pin!=='string'||!/^[0-9]{4}$/.test(pin))
        return res.status(400).json({error:'Driver name and four-digit PIN required'});
      const {hashPin}=require('./auth-utils');
      const q=await db.query('INSERT INTO dispatch_drivers(display_name,pin_hash) VALUES($1,$2) RETURNING id,display_name,active',[displayName.trim(),hashPin(pin)]);
      res.status(201).json(q.rows[0]);
    }catch(e){next(e)}
  });
  // Disable a driver without deleting trip or audit history.
  router.post('/admin/drivers/:id/deactivate',requireAdmin,async(req,res,next)=>{
    try {
      if(!/^[1-9][0-9]*$/.test(req.params.id))return res.status(400).json({error:'Invalid driver ID'});
      const client=await db.connect();
      let q;
      try{
        await client.query('BEGIN');
        // Prevent an in-progress trip becoming inaccessible when its driver is disabled.
        const activeTrip=await client.query("SELECT id FROM dispatch_trips WHERE driver_id=$1 AND status='started' LIMIT 1 FOR UPDATE",[req.params.id]);
        if(activeTrip.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:'Driver has an in-progress trip; complete it before deactivation'});}
        q=await client.query('UPDATE dispatch_drivers SET active=FALSE WHERE id=$1 AND active=TRUE RETURNING id,display_name,active',[req.params.id]);
        if(q.rowCount){
          // Unstarted assignments return to the administrator queue for reassignment.
          const affected=await client.query("UPDATE dispatch_trips SET status='approved',driver_id=NULL,on_my_way_at=NULL,arrived_at=NULL,updated_at=NOW() WHERE driver_id=$1 AND status IN ('assigned','accepted') RETURNING id",[req.params.id]);
          for(const trip of affected.rows)await client.query('INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[trip.id,'admin',String(req.session?.userId||'admin'),'driver_deactivated_unassigned']);
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      if(!q.rowCount)return res.status(404).json({error:'Active driver not found'});
      res.json(q.rows[0]);
    }catch(e){next(e)}
  });
  // Restore an existing driver without changing their PIN or prior trip history.
  router.post('/admin/drivers/:id/activate',requireAdmin,async(req,res,next)=>{
    try {
      if(!/^[1-9][0-9]*$/.test(req.params.id))return res.status(400).json({error:'Invalid driver ID'});
      const q=await db.query('UPDATE dispatch_drivers SET active=TRUE WHERE id=$1 AND active=FALSE RETURNING id,display_name,active',[req.params.id]);
      if(q.rowCount)return res.set('Cache-Control','no-store').json(q.rows[0]);
      const existing=await db.query('SELECT id,display_name,active FROM dispatch_drivers WHERE id=$1',[req.params.id]);
      if(!existing.rowCount)return res.status(404).json({error:'Driver not found'});
      return res.status(409).json({error:'Driver is already active'});
    }catch(e){next(e)}
  });
  router.get('/admin/drivers',requireAdmin,async(req,res,next)=>{
    try {
      const q=await db.query("SELECT id,display_name,active FROM dispatch_drivers ORDER BY display_name");
      res.json(q.rows); // Never expose driver PIN hashes.
    } catch(e){next(e)}
  });
  router.post('/admin/trips',requireAdmin,async(req,res,next)=>{
    try {
      const {passengerSurname,pickupAddress,destinationAddress,pickupAt,passengerPhone}=req.body||{};
      const phone=typeof passengerPhone==='string'?passengerPhone.trim():'';
      if(!validTripPhone(phone))return res.status(400).json({error:'Use international passenger phone format, e.g. +16175550123'});
      const date=typeof pickupAt==='string'?new Date(pickupAt):new Date(NaN);
      if(![passengerSurname,pickupAddress,destinationAddress].every(validTripText)||!Number.isFinite(date.getTime()))
        return res.status(400).json({error:'Invalid trip fields'});
      const client=await db.connect();
      let q;
      try {
        await client.query('BEGIN');
        q=await client.query("INSERT INTO dispatch_trips(passenger_surname,pickup_address,destination_address,pickup_at,passenger_phone,status) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING id,status",
          [passengerSurname.trim(),pickupAddress.trim(),destinationAddress.trim(),date.toISOString(),phone||null]);
        await client.query('INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,'admin',String(req.session?.userId||'admin'),'created']);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      res.status(201).json(q.rows[0]);
    }catch(e){next(e)}
  });
  router.patch('/admin/trips/:id', requireAdmin, async (req, res, next) => {
    const { passengerSurname, passengerPhone, pickupAddress, destinationAddress, pickupLocal, version } = req.body || {};
    const id = req.params.id;
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n ||
        typeof version !== 'string' || !version || version.length > 64 ||
        ![passengerSurname, pickupAddress, destinationAddress].every(validTripText) ||
        typeof passengerPhone !== 'string' || !validTripPhone(passengerPhone.trim())) {
      return res.status(400).json({error:'Invalid trip fields'});
    }

    let pickupAt = null;
    if (pickupLocal !== undefined) {
      const parts = typeof pickupLocal === 'string' && /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(pickupLocal);
      if (!parts) return res.status(400).json({error:'Invalid Boston pickup time'});
      try {
        pickupAt = bostonPickupTime(parts[1], parts[2]).toISOString();
      } catch (error) {
        if (!(error instanceof RangeError)) return next(error);
        return res.status(400).json({error:'Invalid or ambiguous Boston pickup time'});
      }
    }

    try {
      const q = await updateAndAudit(
        `UPDATE dispatch_trips
         SET change_revision=change_revision+CASE WHEN changes.fields IS NULL THEN 0 ELSE 1 END,
             changed_fields=COALESCE(changes.fields, dispatch_trips.changed_fields),
             change_seen_at=CASE WHEN changes.fields IS NULL THEN dispatch_trips.change_seen_at ELSE NULL END,
             passenger_surname=$1, passenger_phone=$2, pickup_address=$3,
             destination_address=$4, pickup_at=COALESCE($5::timestamptz, dispatch_trips.pickup_at), updated_at=NOW()
         FROM (
           SELECT id, CASE WHEN driver_id IS NOT NULL THEN (
             SELECT jsonb_object_agg(field, detail) FROM (VALUES
               ('passenger', 'true'::jsonb, passenger_surname IS DISTINCT FROM $1::text),
               ('phone', 'true'::jsonb, passenger_phone IS DISTINCT FROM $2::text),
               ('pickup', 'true'::jsonb, pickup_address IS DISTINCT FROM $3::text),
               ('destination', 'true'::jsonb, destination_address IS DISTINCT FROM $4::text),
               ('time', jsonb_build_array(pickup_at, $5::timestamptz), $5::timestamptz IS NOT NULL AND pickup_at IS DISTINCT FROM $5::timestamptz)
             ) AS diff(field, detail, changed) WHERE changed
           ) END AS fields FROM dispatch_trips WHERE id=$6
         ) changes
         WHERE dispatch_trips.id=$6 AND changes.id=dispatch_trips.id AND dispatch_trips.status=ANY($7::text[])
           AND dispatch_trips.arrived_at IS NULL AND dispatch_trips.updated_at::text=$8
         RETURNING dispatch_trips.id`,
        [passengerSurname.trim(), passengerPhone.trim() || null, pickupAddress.trim(),
         destinationAddress.trim(), pickupAt, id, editableTripStatuses, version],
        'admin', req.session?.userId || 'admin', 'edited'
      );
      if (!q.rowCount) return res.status(409).json({error:'Trip changed or can no longer be edited'});
      res.json(q.rows[0]);
    } catch (error) {
      next(error);
    }
  });
  router.post('/admin/trips/:id/archive', requireAdmin, async (req, res, next) => {
    const { id } = req.params;
    const version = req.body?.version;
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n ||
        typeof version !== 'string' || !version || version.length > 64) {
      return res.status(400).json({error:'Invalid trip or version'});
    }
    try {
      const q = await updateAndAudit(
        `UPDATE dispatch_trips
         SET status=CASE WHEN status IN ('pending','approved','assigned','accepted','started')
                         THEN 'cancelled' ELSE status END, updated_at=clock_timestamp()
         WHERE id=$1 AND updated_at::text=$2 AND ${notArchived("dispatch_trips.id")}
         RETURNING id`,
        [id, version], 'admin', req.session?.userId || 'admin', 'archived'
      );
      if (!q.rowCount) return res.status(409).json({error:'Trip changed or was already removed from the panels'});
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  // Admin can cancel a trip that has not yet started; assigned drivers lose access immediately.
  router.post('/admin/trips/:id/cancel',requireAdmin,async(req,res,next)=>{
    try {
      const q=await updateAndAudit("UPDATE dispatch_trips SET status='cancelled',updated_at=NOW() WHERE id=$1 AND status IN ('pending','approved','assigned','accepted') RETURNING id,status",[req.params.id], 'admin', req.session?.userId||'admin', 'cancelled');
      if(!q.rowCount)return res.status(409).json({error:'Trip cannot be cancelled in current state'});
      res.json(q.rows[0]);
    }catch(e){next(e)}
  });
  router.get('/admin/trips/:id/history',requireAdmin,async(req,res,next)=>{
    try {
      const q=await db.query('SELECT actor_role,actor_id,action,created_at FROM dispatch_trip_audit WHERE trip_id=$1 ORDER BY created_at DESC LIMIT 100',[req.params.id]);
      res.json(q.rows);
    }catch(e){next(e)}
  });
  router.post('/admin/trips/:id/approve', requireAdmin, async (req,res,next)=>{
    try {
      const q=await updateAndAudit("UPDATE dispatch_trips SET status='approved',updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,status",[req.params.id], 'admin', req.session?.userId||'admin', 'approved');
      if(!q.rowCount) return res.status(409).json({error:'Trip not pending'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  router.post('/admin/trips/:id/reject',requireAdmin,async(req,res,next)=>{
    try {
      const q=await updateAndAudit("UPDATE dispatch_trips SET status='rejected',updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,status",[req.params.id], 'admin', req.session?.userId||'admin', 'rejected');
      if(!q.rowCount)return res.status(409).json({error:'Trip not pending'});
      res.json(q.rows[0]);
    }catch(e){next(e)}
  });
  router.post('/admin/trips/:id/assign',requireAdmin,async(req,res,next)=>{
    try {
      const {driverId}=req.body||{};
      if(!Number.isSafeInteger(driverId)||driverId<1) return res.status(400).json({error:'Invalid driver'});
      const q=await updateAndAudit("UPDATE dispatch_trips SET driver_id=$1,status='assigned',updated_at=NOW() WHERE id=$2 AND status='approved' AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$1 AND active=TRUE) RETURNING id,status,driver_id",[driverId,req.params.id], 'admin', req.session?.userId||'admin', 'assigned');
      if(!q.rowCount) return res.status(409).json({error:'Trip not assignable'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  router.get('/driver/trips',requireDriver,async(req,res,next)=>{
    try {
      const q=await db.query(`SELECT id,passenger_surname,passenger_phone,pickup_address,destination_address,pickup_at,on_my_way_at,arrived_at,status,change_revision,changed_fields,change_seen_at FROM dispatch_trips WHERE driver_id=$1 AND (
        status IN ('assigned','accepted','started','no_show')
        OR id IN (
          SELECT id FROM dispatch_trips completed
          WHERE driver_id=$1 AND status='completed' AND ${notArchived("completed.id")}
          ORDER BY pickup_at DESC, id DESC LIMIT 50
        )
      ) AND ${notArchived("dispatch_trips.id")} AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$1 AND active=TRUE) ORDER BY pickup_at`,[req.driver.id]);
      res.json(q.rows); // Intentionally NEVER return fare or payment data.
    } catch(e){next(e)}
  });
  router.post('/driver/trips/:id/acknowledge-update', requireDriver, async (req, res, next) => {
    const {id} = req.params;
    const {revision} = req.body || {};
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id)>9223372036854775807n ||
        !Number.isInteger(revision) || revision<1 || revision>2147483647) return res.sendStatus(400);
    try {
      const q = await db.query(`UPDATE dispatch_trips
        SET change_seen_at=COALESCE(change_seen_at, NOW())
        WHERE id=$1 AND driver_id=$2 AND change_revision=$3 AND changed_fields IS NOT NULL
          AND status IN ('assigned','accepted','started')
          AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$2 AND active=TRUE)
        RETURNING id`, [id, req.driver.id, revision]);
      if (!q.rowCount) return res.sendStatus(409);
      res.status(204).end();
    } catch (error) { next(error); }
  });
  // Record departure for pickup exactly once; transaction includes the administrator inbox.
  // Requires migration 003 on the isolated dispatch database before deployment.
  router.post('/driver/trips/:id/on-my-way',requireDriver,async(req,res,next)=>{
    try {
      const client=await db.connect();
      let q;
      try {
        await client.query('BEGIN');
        q=await client.query("UPDATE dispatch_trips SET on_my_way_at=NOW(),updated_at=NOW() WHERE id=$1 AND driver_id=$2 AND status='accepted' AND on_my_way_at IS NULL AND arrived_at IS NULL AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$2 AND active=TRUE) RETURNING id,on_my_way_at",[req.params.id,req.driver.id]);
        if(q.rowCount){
          await client.query('INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,'driver',String(req.driver.id),'on_my_way']);
          await client.query("INSERT INTO dispatch_admin_notifications(trip_id,driver_id,event_type) VALUES($1,$2,'on_my_way')",[q.rows[0].id,req.driver.id]);
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      if(!q.rowCount)return res.status(409).json({error:'Departure already recorded or trip not eligible'});
      res.json(q.rows[0]);
    }catch(e){next(e)}
  });
  router.post('/driver/trips/:id/arrive',requireDriver,async(req,res,next)=>{
    try {
      const client=await db.connect();
      let q;
      try {
        await client.query('BEGIN');
        q=await client.query("UPDATE dispatch_trips SET arrived_at=NOW(),updated_at=NOW() WHERE id=$1 AND driver_id=$2 AND status='accepted' AND on_my_way_at IS NOT NULL AND arrived_at IS NULL AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$2 AND active=TRUE) RETURNING id,arrived_at",[req.params.id,req.driver.id]);
        if(q.rowCount){
          await client.query('INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,'driver',String(req.driver.id),'arrived_at_pickup']);
          await client.query("INSERT INTO dispatch_admin_notifications(trip_id,driver_id,event_type) VALUES($1,$2,'arrived_at_pickup')",[q.rows[0].id,req.driver.id]);
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      if(!q.rowCount)return res.status(409).json({error:'Arrival already recorded or trip not eligible'});
      res.json(q.rows[0]);
    }catch(e){next(e)}
  });
  // Administrator-only inbox. Never exposed through driver endpoints.
  router.get('/admin/notifications',requireAdmin,async(req,res,next)=>{
    try {
      const q=await db.query(`SELECT notices.id,notices.trip_id,notices.driver_id,notices.event_type,notices.created_at,notices.read_at,t.passenger_surname,d.display_name AS driver_name FROM (SELECT n.id,n.trip_id,n.driver_id::text AS driver_id,n.event_type,n.created_at,n.read_at FROM dispatch_admin_notifications n UNION ALL SELECT -a.id AS id,a.trip_id,a.actor_id AS driver_id,CASE WHEN a.action='driver:started' THEN 'trip_started' ELSE 'no_show' END AS event_type,a.created_at,NULL::timestamptz AS read_at FROM dispatch_trip_audit a WHERE a.actor_role='driver' AND a.action IN ('driver:no_show','driver:started')) notices JOIN dispatch_trips t ON t.id=notices.trip_id JOIN dispatch_drivers d ON d.id::text=notices.driver_id WHERE ${notArchived("t.id")} ORDER BY notices.created_at DESC,notices.id DESC LIMIT 100`);
      res.set('Cache-Control','no-store').json(q.rows);
    }catch(e){next(e)}
  });
  router.post('/driver/trips/:id/status',requireDriver,async(req,res,next)=>{
    try {
      const nextStatus={assigned:['accepted','rejected'],accepted:['started','no_show'],started:['completed']};
      const {status,confirmAtPickup}=req.body||{};
      // A no-show must be a deliberate assertion by the assigned driver at the pickup location.
      if(status==='no_show'&&confirmAtPickup!==true)return res.status(400).json({error:'Pickup arrival confirmation required'});
      if(!['accepted','rejected','started','completed','no_show'].includes(status)) return res.status(400).json({error:'Invalid status'});
      const allowedFrom=Object.keys(nextStatus).filter(k=>nextStatus[k].includes(status));
      let q;
      if(status==='completed'){
        const client=await db.connect();
        try {
          await client.query('BEGIN');
          q=await client.query("UPDATE dispatch_trips SET status='completed',updated_at=NOW() WHERE id=$1 AND driver_id=$2 AND status='started' AND on_my_way_at IS NOT NULL AND arrived_at IS NOT NULL AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$2 AND active=TRUE) RETURNING id,status",[req.params.id,req.driver.id]);
          if(q.rowCount){
            await client.query('INSERT INTO dispatch_trip_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,'driver',String(req.driver.id),'driver:completed']);
            await client.query("INSERT INTO dispatch_admin_notifications(trip_id,driver_id,event_type) VALUES($1,$2,'trip_completed')",[q.rows[0].id,req.driver.id]);
          }
          await client.query('COMMIT');
        }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      }else{
        q=await updateAndAudit("UPDATE dispatch_trips SET status=$1,updated_at=NOW() WHERE id=$2 AND driver_id=$3 AND status=ANY($4::text[]) AND ($1 <> 'no_show' OR (arrived_at IS NOT NULL AND arrived_at <= NOW() - INTERVAL '15 minutes')) AND ($1 <> 'started' OR (on_my_way_at IS NOT NULL AND arrived_at IS NOT NULL)) AND ($1 <> 'no_show' OR on_my_way_at IS NOT NULL) AND ($1 <> 'started' OR on_my_way_at <= arrived_at) AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$3 AND active=TRUE) RETURNING id,status",[status,req.params.id,req.driver.id,allowedFrom], 'driver', req.driver.id, 'driver:'+status);
      }
      if(!q.rowCount) return res.status(404).json({error:'Trip not found or transition invalid'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  return router;
}
module.exports={createDispatchRouter};
