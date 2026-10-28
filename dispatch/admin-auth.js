"use strict";
const crypto = require("node:crypto");
const { promisify } = require("node:util");
const scrypt = promisify(crypto.scrypt);
const COOKIE = "__Host-pimentel_admin";
const digest = value => crypto.createHash("sha256").update(value).digest("hex");
const equal = (a, b) => crypto.timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));

// Sessions deliberately expire on restart and are never sent to browser JavaScript.
function createAdminAuth({ email, passwordHash, origin, now = Date.now }) {
  if (!email || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash || "") ||
      !origin || new URL(origin).origin !== origin || !origin.startsWith("https://")) {
    throw new Error("Configure DISPATCH_ADMIN_EMAIL, DISPATCH_ADMIN_PASSWORD_HASH and HTTPS DISPATCH_ORIGIN");
  }
  const sessions = new Map(), attempts = new Map();
  const ttl = 60 * 60 * 1000, window = 15 * 60 * 1000;
  const cookie = (token, age) => COOKIE + "=" + token + "; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=" + age;
  const fail = (res, status, error) => res.status(status).json({ error });
  function clean() {
    for (const [key, item] of sessions) if (item.expires <= now()) sessions.delete(key);
    for (const [key, item] of attempts) if (item.expires <= now()) attempts.delete(key);
  }
  function session(req) {
    const token = (req.get("cookie") || "").split(";").map(s => s.trim()).find(s => s.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const key = digest(token), item = sessions.get(key);
    if (!item || item.expires <= now()) { sessions.delete(key); return null; }
    return { key, ...item };
  }
  function sameOrigin(req) { return req.get("origin") === origin; }
  async function login(req, res, next) {
    try {
      if (!sameOrigin(req)) return fail(res, 403, "Origen no permitido");
      clean();
      // Global ceiling also bounds expensive scrypt work across rotating IP addresses.
      const ip = String(req.ip || "unknown");
      const global = attempts.get("*") || { count: 0, expires: now() + window };
      const local = attempts.get(ip) || { count: 0, expires: now() + window };
      if (global.count >= 100 || local.count >= 8) return fail(res, 429, "Demasiados intentos. Espera 15 minutos.");
      global.count++; local.count++; attempts.set("*", global); attempts.set(ip, local);
      const body = req.body || {};
      if (typeof body.email !== "string" || body.email.length > 254 ||
          typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128)
        return fail(res, 401, "Credenciales incorrectas");
      const [salt, expected] = passwordHash.split(":");
      const actual = await scrypt(body.password, salt, 64);
      if (!crypto.timingSafeEqual(actual, Buffer.from(expected, "hex")) ||
          !equal(body.email.trim().toLowerCase(), email.trim().toLowerCase()))
        return fail(res, 401, "Credenciales incorrectas");
      if (sessions.size >= 1000) return fail(res, 503, "Intenta más tarde");
      const previous = session(req);
      if (previous) sessions.delete(previous.key);
      const token = crypto.randomBytes(32).toString("hex"), csrf = crypto.randomBytes(32).toString("hex");
      sessions.set(digest(token), { csrf, expires: now() + ttl });
      res.set("Set-Cookie", cookie(token, ttl / 1000)).json({ csrfToken: csrf, expiresInSeconds: ttl / 1000 });
    } catch (error) { console.error("Admin login failed"); fail(res, 500, "No se pudo iniciar sesión"); }
  }
  function authenticate(req, res, next) {
    const item = session(req);
    if (!item) return fail(res, 401, "Se requiere iniciar sesión");
    if (!["GET", "HEAD"].includes(req.method) &&
        (!sameOrigin(req) || !equal(req.get("x-csrf-token") || "", item.csrf)))
      return fail(res, 403, "Solicitud no válida. Inicia sesión nuevamente.");
    req.actor = { role: "admin", id: "admin" };
    req.adminSession = item;
    next();
  }
  function logout(req, res) {
    sessions.delete(req.adminSession.key);
    res.set("Set-Cookie", cookie("", 0)).json({ ok: true });
  }
  return { login, authenticate, logout };
}
module.exports = { createAdminAuth };
