// Isolated dispatch router. NOT mounted in the production payments server.
// Requires express and a configured PostgreSQL 'db' adapter (node-postgres Pool).
// Admin authentication is intentionally NOT implemented here: routes must be
// mounted only after verified admin session middleware is installed.
const express = require('express');
function createDispatchRouter({db, requireAdmin, requireDriver}) {
  if (!db || !requireAdmin || !requireDriver) throw new Error('Missing dispatch security dependencies');
  const router = express.Router();
  // Admin-only queue; fare data is deliberately never exposed in driver endpoints.
  router.get('/admin/trips',requireAdmin,async(req,res,next)=>{
    try {
      const q=await db.query("SELECT id,passenger_surname,pickup_address,destination_address,pickup_at,fare_cents,driver_id,status FROM dispatch_trips ORDER BY pickup_at DESC LIMIT 100");
      res.json(q.rows);
    } catch(e){next(e)}
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
      const q=await db.query("INSERT INTO dispatch_trips(passenger_surname,pickup_address,destination_address,pickup_at,status) VALUES ($1,$2,$3,$4,'pending') RETURNING id,status",
        [passengerSurname.trim(),pickupAddress.trim(),destinationAddress.trim(),date.toISOString()]);
      res.status(201).json(q.rows[0]);
    }catch(e){next(e)}
  });
  router.post('/admin/trips/:id/approve', requireAdmin, async (req,res,next)=>{
    try {
      const q=await db.query("UPDATE dispatch_trips SET status='approved',updated_at=NOW() WHERE id=$1 AND status='pending' RETURNING id,status",[req.params.id]);
      if(!q.rowCount) return res.status(409).json({error:'Trip not pending'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  router.post('/admin/trips/:id/assign',requireAdmin,async(req,res,next)=>{
    try {
      const {driverId}=req.body||{};
      if(!Number.isSafeInteger(driverId)||driverId<1) return res.status(400).json({error:'Invalid driver'});
      const q=await db.query("UPDATE dispatch_trips SET driver_id=$1,status='assigned',updated_at=NOW() WHERE id=$2 AND status='approved' AND EXISTS (SELECT 1 FROM dispatch_drivers WHERE id=$1 AND active=TRUE) RETURNING id,status,driver_id",[driverId,req.params.id]);
      if(!q.rowCount) return res.status(409).json({error:'Trip not assignable'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  router.get('/driver/trips',requireDriver,async(req,res,next)=>{
    try {
      const q=await db.query("SELECT id,passenger_surname,pickup_address,destination_address,pickup_at,status FROM dispatch_trips WHERE driver_id=$1 AND status IN ('assigned','accepted','started') ORDER BY pickup_at",[req.driver.id]);
      res.json(q.rows); // Intentionally NEVER return fare or payment data.
    } catch(e){next(e)}
  });
  router.post('/driver/trips/:id/status',requireDriver,async(req,res,next)=>{
    try {
      const nextStatus={assigned:['accepted','rejected'],accepted:['started'],started:['completed']};
      const {status}=req.body||{};
      if(!['accepted','rejected','started','completed'].includes(status)) return res.status(400).json({error:'Invalid status'});
      const allowedFrom=Object.keys(nextStatus).filter(k=>nextStatus[k].includes(status));
      const q=await db.query("UPDATE dispatch_trips SET status=$1,updated_at=NOW() WHERE id=$2 AND driver_id=$3 AND status=ANY($4::text[]) RETURNING id,status",[status,req.params.id,req.driver.id,allowedFrom]);
      if(!q.rowCount) return res.status(404).json({error:'Trip not found or transition invalid'});
      res.json(q.rows[0]);
    } catch(e){next(e)}
  });
  return router;
}
module.exports={createDispatchRouter};
