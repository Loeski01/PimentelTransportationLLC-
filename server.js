
const express = require("express");
const Stripe = require("stripe");

const app = express();
app.use(express.json({ limit: "10kb" }));app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "https://loeski01.github.io");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey, { timeout: 12000, maxNetworkRetries: 0 }) : null;

const SITE = "https://loeski01.github.io";
const BASE_PATH = "/PimentelTransportationLLC-";
const CALCULATOR = SITE + BASE_PATH + "/calculadora-gps-pimentel.html";

app.get("/", (req, res) => {
  res.json({ service: "Pimentel Transportation Payments", status: "online" });
});

class QuoteError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const quoteCache = new Map();
let nextGeocode = 0;
async function getJSON(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "PimentelTransportationLLC/1.0 (https://loeski01.github.io/PimentelTransportationLLC-/)" }
  });
  if (!response.ok) throw new QuoteError(503, "MAP_UNAVAILABLE", "El servicio de mapas no está disponible. Inténtalo más tarde.");
  return response.json();
}
async function locate(address, signal) {
  // Space all Nominatim requests, including concurrent visitors, at least one second apart.
  const slot = Math.max(Date.now(), nextGeocode);
  if (slot - Date.now() > 3000) throw new QuoteError(503, "BUSY", "Hay varias consultas en curso. Inténtalo en unos segundos.");
  nextGeocode = slot + 1100;
  await require("node:timers/promises").setTimeout(Math.max(0, slot - Date.now()), undefined, { signal });
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=" + encodeURIComponent(address);
  const results = await getJSON(url, signal);
  if (!Array.isArray(results)) throw new Error("Invalid geocoder response");
  if (!results.length) throw new QuoteError(422, "ADDRESS_NOT_FOUND", "No se encontró la dirección: " + address + ". Incluye ciudad y estado.");
  const place = results[0];
  if (!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) throw new Error("Invalid coordinates");
  return place;
}
function validAddresses(from, to) {
  return [from, to].every(v => typeof v === "string" && v.trim() && v.length <= 200);
}
function sendError(res, error) {
  if (error.name === "TimeoutError" || error.name === "AbortError") {
    return res.status(504).json({ code: "QUOTE_TIMEOUT", error: "El cálculo tardó demasiado. Inténtalo nuevamente en unos segundos." });
  }
  res.status(error.status || 502).json({ code: error.code || "MAP_ERROR", error: error.status ? error.message : "No se pudo consultar la ruta. Inténtalo más tarde." });
}

function airportPickup(address, location) {
  const value = (address + " " + location.display_name).toLowerCase();
  return /\b(logan|airport|aeropuerto|bos international|boston logan|manchester.boston regional|boston airport|tf green|t\. ?f\. ?green|bradley international|pvd airport)\b/i.test(value);
}

async function calculateFare(from, to) {
  const key = JSON.stringify([from, to]);
  const cached = quoteCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const signal = AbortSignal.timeout(10000); // One deadline for the complete map operation.
  const a = await locate(from, signal);
  const b = await locate(to, signal);
  const coordinates = `${a.lon},${a.lat};${b.lon},${b.lat}`;
  const data = await getJSON(`https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=false&steps=false`, signal);
  if (data.code === "NoRoute" || (data.code === "Ok" && !data.routes?.length)) {
    throw new QuoteError(422, "NO_ROUTE", "No se encontró una ruta en automóvil entre esas direcciones.");
  }
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route || !Number.isFinite(route.distance) || !Number.isFinite(route.duration) || route.distance < 0 || route.duration < 0) throw new Error("Invalid route response");
  const miles = route.distance / 1609.344;
  const minutes = route.duration / 60;
  const airportFee = airportPickup(from, a) ? 10 : 0;
  const quote = { miles, minutes, base: 35, mileage: miles * 3.5, time: minutes * 0.5, airportFee,
    amount: Math.round(Math.max(65, 35 + miles * 3.5 + minutes * 0.5 + airportFee) * 100), currency: "usd" };
  if (quoteCache.size >= 500) quoteCache.delete(quoteCache.keys().next().value);
  quoteCache.set(key, { value: quote, expires: Date.now() + 300000 });
  return quote;
}
app.post("/api/quote", async (req, res) => {
  const { from, to } = req.body || {};
  if (!validAddresses(from, to)) return res.status(400).json({ code: "INVALID_ADDRESS", error: "Escribe las dos direcciones (máximo 200 caracteres cada una)." });
  try { res.setHeader("Cache-Control", "no-store"); res.json(await calculateFare(from.trim(), to.trim())); }
  catch (error) { sendError(res, error); }
});

app.post("/api/create-checkout-session", async (req, res) => {
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const { from, to, customerName, phone, tipPercent = 0, tipCents = 0, expectedFareCents, paymentKind = "ride" } = req.body || {};

  if (
    typeof from !== "string" ||
    typeof to !== "string" ||
    typeof customerName !== "string" ||
    typeof phone !== "string" ||
    !from.trim() || !to.trim() ||
    !customerName.trim() || !phone.trim() ||
    from.length > 200 || to.length > 200 ||
    customerName.length > 100 || phone.length > 40
  ) {
    return res.status(400).json({ error: "Invalid booking details" });
  }

  if (![0, 10, 15, 20].includes(tipPercent) || !Number.isSafeInteger(tipCents) || tipCents < 0 || tipCents > 100000 ||
      (tipPercent !== 0 && tipCents !== 0) || !["ride", "tip_only"].includes(paymentKind) ||
      !Number.isSafeInteger(expectedFareCents) || expectedFareCents < 0) {
    return res.status(400).json({ error: "Propina o datos de pago inválidos." });
  }
  try {
    const { amount } = await calculateFare(from.trim(), to.trim());
    if (amount !== expectedFareCents) return res.status(409).json({ error: "La tarifa cambió. Vuelve a calcular y revisa el total antes de pagar." });
    const gratuity = tipPercent ? Math.round(amount * tipPercent / 100) : tipCents;
    if (paymentKind === "tip_only" && gratuity < 50) return res.status(400).json({ error: "Para pagar solo la propina, elige al menos $0.50." });
    const lineItems = [];
    if (paymentKind === "ride") lineItems.push({price_data:{currency:"usd",unit_amount:amount,product_data:{name:"Pimentel Transportation - Private Transfer"}},quantity:1});
    if (gratuity > 0) lineItems.push({price_data:{currency:"usd",unit_amount:gratuity,product_data:{name:"Optional driver gratuity / Propina voluntaria"}},quantity:1});

    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted",
      mode: "payment",
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: "auto",
      customer_creation: "always",
      line_items: lineItems,
      metadata: {
        from: from.trim(),
        to: to.trim(),
        customerName: customerName.trim(),
        phone: phone.trim(),
        paymentKind,
        tipCents: String(gratuity)
      },
      success_url: CALCULATOR + "?payment=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: CALCULATOR + "?payment=cancelled"
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Checkout creation failed:", error.message);
    if (error.type?.startsWith("Stripe")) return res.status(502).json({ error: "No se pudo abrir el pago. Inténtalo más tarde o contacta a la compañía." });
    sendError(res, error);
  }
});


// Brevo Transactional Email uses HTTPS, compatible with Render free services.
// Configure BREVO_API_KEY and a sender verified in Brevo before enabling.
const notificationEmail = process.env.BOOKING_NOTIFY_EMAIL || "Cesarloeski17@gmail.com";
const brevoApiKey = process.env.BREVO_API_KEY;
const senderEmail = process.env.BREVO_SENDER_EMAIL;
const senderName = "Pimentel Transportation LLC";
const mailReady = Boolean(brevoApiKey && senderEmail);
async function sendBookingEmail({to, subject, text, replyTo}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const payload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      textContent: text
    };
    if (replyTo) payload.replyTo = { email: replyTo };
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "api-key": brevoApiKey },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      console.error("Brevo email request rejected; HTTP status:", response.status);
      throw new Error("Email provider rejected the request");
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}
const bookingThrottle = new Map();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v, max) => typeof v === "string" ? v.trim().slice(0, max) : "";
app.post("/api/booking-request", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!mailReady) return res.status(503).json({ error: "Las notificaciones automáticas todavía no están activadas. Usa WhatsApp o correo." });
  const ip = req.ip || "unknown";
  const last = bookingThrottle.get(ip) || 0;
  if (Date.now() - last < 60000) return res.status(429).json({ error: "Espera un minuto antes de enviar otra solicitud." });
  if (bookingThrottle.size > 2000) bookingThrottle.clear();
  const body = req.body || {};
  const name = clean(body.name, 100), phone = clean(body.phone, 40);
  const email = clean(body.email, 254), from = clean(body.from, 200), to = clean(body.to, 200);
  const date = clean(body.date, 10), time = clean(body.time, 5);
  const passengers = clean(body.passengers, 20), details = clean(body.details, 500);
  const payment = clean(body.payment, 30);
  const tipPercent = Number(body.tipPercent), tipCents = Number(body.tipCents);
  if (!name || !phone || !emailPattern.test(email) || !validAddresses(from, to) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      !Number.isSafeInteger(body.expectedFareCents) || body.expectedFareCents < 0 ||
      ![0, 10, 15, 20].includes(tipPercent) || !Number.isSafeInteger(tipCents) ||
      tipCents < 0 || tipCents > 100000 || (tipPercent > 0 && tipCents > 0) ||
      !["later", "coordinate"].includes(payment)) {
    return res.status(400).json({ error: "Revisa los datos de la reserva." });
  }
  bookingThrottle.set(ip, Date.now());
  try {
    const fare = await calculateFare(from, to);
    if (fare.amount !== body.expectedFareCents) return res.status(409).json({ error: "La tarifa cambió. Calcula nuevamente antes de reservar." });
    const tip = tipPercent ? Math.round(fare.amount * tipPercent / 100) : tipCents;
    const dollars = cents => "$" + (cents / 100).toFixed(2);
    const reference = "PT-" + Date.now().toString(36).toUpperCase();
    const summary = [
      "Solicitud: " + reference, "Nombre: " + name, "Correo: " + email,
      "Teléfono: " + phone, "Fecha: " + date, "Hora: " + time,
      "Recogida: " + from, "Destino: " + to, "Pasajeros: " + passengers,
      "Tarifa estimada: " + dollars(fare.amount), "Propina opcional: " + dollars(tip),
      "Total estimado: " + dollars(fare.amount + tip),
      "Pago: " + payment, "Detalles: " + details,
      "Estado: PENDIENTE DE CONFIRMACIÓN"
    ].join("\n");
    await sendBookingEmail({
      to: notificationEmail,
      replyTo: email,
      subject: "Nueva solicitud de reserva " + reference,
      text: summary
    });
    let customerNoticeSent = false;
    try {
      await sendBookingEmail({
        to: email,
        replyTo: notificationEmail,
        subject: "Solicitud recibida / Request received - " + reference,
        text: "Gracias por elegir Pimentel Transportation LLC.\n\nHemos recibido tu solicitud. Tu viaje NO está confirmado hasta que nuestra empresa lo apruebe.\n\nThank you for your request. Your ride is NOT confirmed until our company approves it.\n\n" + summary + "\n\nContacto: " + notificationEmail
      });
      customerNoticeSent = true;
    } catch (error) {
      console.error("Customer email delivery error:", error.message);
    }
    res.json({ reference, received: true, customerNoticeSent });
  } catch (error) {
    console.error("Booking request failed:", error.message);
    if (error.status) return sendError(res, error);
    res.status(502).json({ error: "No se pudo enviar la solicitud. Intenta nuevamente o utiliza WhatsApp." });
  }
});


// Driver dispatch is opt-in until the private PostgreSQL database and
// administrator credentials have been configured. Existing payment and
// booking endpoints remain unchanged when it is disabled.
if (process.env.ENABLE_DISPATCH === "true") {
  if (!process.env.DATABASE_URL || !process.env.DISPATCH_ADMIN_TOKEN ||
      process.env.DISPATCH_ADMIN_TOKEN.length < 32) {
    throw new Error("Dispatch requires DATABASE_URL and a strong DISPATCH_ADMIN_TOKEN");
  }
  const path = require("node:path");
  app.use("/api/dispatch", require("./dispatch/login"));
  app.use("/api/dispatch", require("./dispatch/router").router);
  // Keep the prototype administrator page inaccessible until secure
  // server-side administrator authentication has been implemented.
  app.use("/despacho", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(503).json({ error: "Panel administrativo pendiente de autenticación segura" });
  });
  app.use("/conductores", express.static(path.join(__dirname, "dispatch/public"), {
    index: "index.html",
    setHeaders: res => res.setHeader("Cache-Control", "no-store")
  }));
}

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Payment server listening on port", PORT);
  console.log("Dispatch test configuration:", JSON.stringify({dispatchFlag: process.env.ENABLE_DISPATCH === "false" ? "disabled" : process.env.ENABLE_DISPATCH === "true" ? "enabled" : "unset_or_invalid", databaseUrlConfigured: Boolean(process.env.DATABASE_URL), databaseNameMatches: (() => { try { return decodeURIComponent(new URL(process.env.DATABASE_URL).pathname.slice(1)) === "pimentel_dispatch_dev"; } catch { return false; } })()}));
  // One-shot, explicitly gated schema migration for the isolated development database.
  // The migration script itself refuses any database except pimentel_dispatch_dev.
  if (process.env.ENABLE_DISPATCH === "false" && process.env.DISPATCH_MIGRATION_TARGET === "development" && process.env.DATABASE_URL) {
    const { execFile } = require("node:child_process");
    execFile(process.execPath, ["dispatch/migrate.js"], { cwd: __dirname, timeout: 20000, maxBuffer: 8192 }, (error, stdout) => {
      console.log("Dispatch development migration:", error ? "FAILED" : "SUCCEEDED");
      if (!error && stdout.trim()) console.log(stdout.trim());
    });
  }
  // Read-only PostgreSQL check for the isolated dispatch test service.
  // Never runs when dispatch is enabled; no secrets or customer data in logs.
  if (process.env.ENABLE_DISPATCH === "false" && process.env.DATABASE_URL) {
    const { execFile } = require("node:child_process");
    execFile(process.execPath, ["dispatch/verify-db.js"], {
      cwd: __dirname, timeout: 15000, maxBuffer: 8192
    }, (error, stdout, stderr) => {
      if (error) {
        const diagnostic = String(stderr || "");
        const category = /ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(diagnostic) ? "DNS_RESOLUTION" : /ECONNREFUSED|ETIMEDOUT|timeout|ENETUNREACH/i.test(diagnostic) ? "NETWORK_CONNECTION" : /password authentication failed|28P01/i.test(diagnostic) ? "AUTHENTICATION" : /database .* does not exist|3D000/i.test(diagnostic) ? "DATABASE_NOT_FOUND" : /Unexpected database/i.test(diagnostic) ? "WRONG_DATABASE" : /certificate|SSL|self.signed/i.test(diagnostic) ? "TLS_CONFIGURATION" : "OTHER";
        console.log("Dispatch DB check failed:", JSON.stringify({category, exitCode: error.code || "unknown"}));
      }
      const result = stdout.trim();
      if (result) console.log("Dispatch DB check result:", result);
    });
  }
});
