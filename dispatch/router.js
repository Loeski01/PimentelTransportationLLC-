// Isolated dispatch router. NOT mounted in the production payments server.
// Requires express and a configured PostgreSQL 'db' adapter (node-postgres Pool).
// Admin authentication is intentionally NOT implemented here: routes must be
// mounted only after verified admin session middleware is installed.
const express = require('express');
function createDispatchRouter({db, requireAdmin, requireDriver}) {
  if (!db || !requireAdmin || !requireDriver) throw new Error('Missing dispatch security dependencies');
  const router = express.Router();
  // A trip update and its audit record must commit together.
  async function updateAndAudit(sql,params,actorRole,actorId,action){
    const client=await db.connect();
    try {
      await client.query('BEGIN');
      const q=await client.query(sql,params);
      if(q.rowCount)await client.query('INSERT INTO dispatch_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,actorRole,String(actorId),action]);
      await client.query('COMMIT');
      return q;
    }catch(e){await client.query('ROLLBACK');throw e}
    finally{client.release()}
  }
  // Admin-only queue; fare data is deliberately never exposed in driver endpoints.
  router.get('/admin/trips',requireAdmin,async(req,res,next)=>{
    try {
      const q=await db.query("SELECT id,passenger_surname,pickup_address,destination_address,pickup_at,fare_cents,driver_id,status FROM dispatch_trips ORDER BY pickup_at DESC LIMIT 100");
      res.json(q.rows);
    } catch(e){next(e)}
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
        q=await client.query('UPDATE dispatch_drivers SET active=FALSE WHERE id=$1 AND active=TRUE RETURNING id,display_name,active',[req.params.id]);
        if(q.rowCount){
          // Unstarted assignments return to the administrator queue for reassignment.
          const affected=await client.query("UPDATE dispatch_trips SET status='approved',driver_id=NULL,updated_at=NOW() WHERE driver_id=$1 AND status IN ('assigned','accepted') RETURNING id",[req.params.id]);
          for(const trip of affected.rows)await client.query('INSERT INTO dispatch_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[trip.id,'admin',String(req.session?.userId||'admin'),'driver_deactivated_unassigned']);
        }
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      if(!q.rowCount)return res.status(404).json({error:'Active driver not found'});
      res.json(q.rows[0]);
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
      const {passengerSurname,pickupAddress,destinationAddress,pickupAt}=req.body||{};
      const valid=s=>typeof s==='string'&&s.trim().length>0&&s.trim().length<=250;
      const date=typeof pickupAt==='string'?new Date(pickupAt):new Date(NaN);
      if(!valid(passengerSurname)||!valid(pickupAddress)||!valid(destinationAddress)||!Number.isFinite(date.getTime()))
        return res.status(400).json({error:'Invalid trip fields'});
      const client=await db.connect();
      let q;
      try {
        await client.query('BEGIN');
        q=await client.query("INSERT INTO dispatch_trips(passenger_surname,pickup_address,destination_address,pickup_at,status) VALUES ($1,$2,$3,$4,'pending') RETURNING id,status",
          [passengerSurname.trim(),pickupAddress.trim(),destinationAddress.trim(),date.toISOString()]);
        await client.query('INSERT INTO dispatch_audit(trip_id,actor_role,actor_id,action) VALUES($1,$2,$3,$4)',[q.rows[0].id,'admin',String(req.session?.userId||'admin'),'created']);
        await client.query('COMMIT');
      }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
      res.status(201).json(q.rows[0]);
    }catch(e){next(e)}
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
      const q=await db.query('SELECT actor_role,actor_id,action,created_at FROM dispatch_audit WHERE trip_id=$1 ORDER BY created_at DESC LIMIT 100',[req.params.id]);
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
      const q=await db.query("SELECT id,passenger_surname,pickup_address,destination_address,pickup_at,status FROM dispatch_trips WHERE driver_id=$1 AND status IN ('assigned','accepted','started') AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$1 AND active=TRUE) ORDER BY pickup_at",[req.driver.id]);
      res.json(q.rows); // Intentionally NEVER return fare or payment data.
    } catch(e){next(e)}
  });
  router.post('/driver/trips/:id/status',requireDriver,async(req,res,next)=>{
    try {
      const nextStatus={assigned:['accepted','rejected'],accepted:['started'],started:['completed']};
      const {status}=req.body||{};
      if(!['accepted','rejected','started','completed'].includes(status)) return res.status(400).json({error:'Invalid status'});
      const allowedFrom=Object.keys(nextStatus).filter(k=>nextStatus[k].includes(status));
      const q=await updateAndAudit("UPDATE dispatch_trips SET status=$1,updated_at=NOW() WHERE id=$2 AND driver_id=$3 AND status=ANY($4::text[]) AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$3 AND active=TRUE) RETURNING id,status",[status,req.params.id,req.driver.id,allowedFrom], 'driver', req.driver.id, 'driver:'+status);
      if(!q.rowCount) return res.status(404).json({error:'Trip not found or transition invalid'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  return router;
}
module.exports={createDispatchRouter};
