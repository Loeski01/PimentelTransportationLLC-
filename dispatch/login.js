const express = require('express');
const {verifyPin} = require('./auth-utils');
// Development-only. Mount behind HTTPS, persistent secure sessions and rate limiting.
function createLoginRouter({db, checkAdminPassword, rotateSession}) {
  if (!db || !checkAdminPassword || !rotateSession) throw new Error('Missing login dependencies');
  const router = express.Router();
  router.post('/login', async (req,res,next) => {
    try {
      const {role,password,driverId,pin} = req.body || {};
      let id;
      if (role === 'admin') {
        if (typeof password !== 'string' || !(await checkAdminPassword(password))) return res.sendStatus(401);
        id = 'admin';
      } else if (role === 'driver') {
        if (!Number.isSafeInteger(driverId) || driverId < 1 || typeof pin !== 'string') return res.sendStatus(401);
        const q = await db.query('SELECT id,pin_hash FROM dispatch_drivers WHERE id=$1 AND active=TRUE',[driverId]);
        if (!q.rowCount || !verifyPin(pin,q.rows[0].pin_hash)) return res.sendStatus(401);
        id = q.rows[0].id;
      } else return res.sendStatus(400);
      await rotateSession(req);
      req.session.userId = id;
      req.session.role = role;
      res.json({role});
    } catch (err) { next(err); }
  });
  router.post('/logout',(req,res,next) => {
    if (!req.session) return res.sendStatus(204);
    req.session.destroy(err => err ? next(err) : res.sendStatus(204));
  });
  return router;
}
module.exports = {createLoginRouter};
