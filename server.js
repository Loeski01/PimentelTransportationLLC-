
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
const addressCache = new Map();
let geocodeBlockedUntil = 0;
function checkGeocoderCooldown() {
  if (Date.now() < geocodeBlockedUntil) throw new QuoteError(503, "MAP_RATE_LIMIT", "El servicio de direcciones está ocupado. Inténtalo en unos segundos.");
}
async function getJSON(url, signal) {
  const response = await fetch(url, {
    signal,
    headers: { Accept: "application/json", "User-Agent": "PimentelTransportationLLC/1.0 (https://loeski01.github.io/PimentelTransportationLLC-/)" }
  });
  if (!response.ok) {
    if (new URL(url).hostname === "nominatim.openstreetmap.org" && response.status === 429) {
      const retry = response.headers?.get?.("retry-after");
      const seconds = retry && /^\d+$/.test(retry) ? Number(retry) : 0;
      const until = seconds ? Date.now() + seconds * 1000 : Date.parse(retry || "");
      geocodeBlockedUntil = Math.max(Date.now() + 60000, Number.isFinite(until) ? until : 0);
      checkGeocoderCooldown();
    }
    console.error("Map provider rejected request:", new URL(url).hostname, "HTTP", response.status);
    throw new QuoteError(503, "MAP_UNAVAILABLE", "El servicio de mapas no está disponible. Inténtalo más tarde.");
  }
  return response.json();
}
async function locate(address, signal) {
  const key = address.trim().replace(/\s+/g, " ").toLowerCase();
  const cached = addressCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.place;
  let place;
  try {
    place = await locateWithNominatim(address, AbortSignal.any([signal, AbortSignal.timeout(4000)]));
  } catch (error) {
    if (signal.aborted || (error instanceof QuoteError && error.status < 500)) throw error;
    place = await locateWithPhoton(address, signal);
  }
  if (addressCache.size >= 1000) addressCache.delete(addressCache.keys().next().value);
  addressCache.set(key, { place, expires: Date.now() + 86400000 });
  return place;
}
async function locateWithNominatim(address, signal) {
  checkGeocoderCooldown();
  // Space all Nominatim requests, including concurrent visitors, at least one second apart.
  const slot = Math.max(Date.now(), nextGeocode);
  if (slot - Date.now() > 3000) throw new QuoteError(503, "BUSY", "Hay varias consultas en curso. Inténtalo en unos segundos.");
  nextGeocode = slot + 1100;
  await require("node:timers/promises").setTimeout(Math.max(0, slot - Date.now()), undefined, { signal });
  checkGeocoderCooldown();
  const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=" + encodeURIComponent(address);
  const results = await getJSON(url, signal);
  if (!Array.isArray(results)) throw new Error("Invalid geocoder response");
  if (!results.length) throw new QuoteError(422, "ADDRESS_NOT_FOUND", "No se encontró la dirección: " + address + ". Incluye ciudad y estado.");
  const place = results[0];
  if (!Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lon))) throw new Error("Invalid coordinates");
  return place;
}
async function locateWithPhoton(address, signal) {
  const params = new URLSearchParams({q: address, countrycode: "US", limit: "5"});
  const data = await getJSON("https://photon.komoot.io/api/?" + params, signal);
  if (!Array.isArray(data.features)) throw new Error("Invalid geocoder response");
  const streetNumber = address.match(/^\s*(\d+[a-z]?)\b/i)?.[1].toLowerCase();
  for (const feature of data.features) {
    const fields = feature.properties || {};
    if (fields.countrycode !== "US" || !["MA", "NH", "RI", "CT", "ME", "VT", "NY", "NJ"].includes(fields.state)) continue;
    if (streetNumber && fields.housenumber?.toLowerCase() !== streetNumber) continue;
    if (!streetNumber && !["house", "street"].includes(fields.type) && fields.osm_value !== "aerodrome") continue;
    const [lon, lat] = feature.geometry?.coordinates || [];
    if (Number.isFinite(lon) && Number.isFinite(lat)) {
      return {lon, lat, display_name: [fields.name, fields.street, fields.city, fields.state].filter(Boolean).join(", ")};
    }
  }
  throw new QuoteError(422, "ADDRESS_NOT_FOUND", "Address not found. Include the street number, city and state. / Dirección no encontrada. Incluye número, ciudad y estado.");
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

const SERVICE_RATES = Object.freeze({
  luxury: {base:35, mile:3.5, minute:0.5, minimum:65, hourly:95},
  comfort: {base:30, mile:2.75, minute:0.35, minimum:55, hourly:75}
});
const validTier = tier => Object.prototype.hasOwnProperty.call(SERVICE_RATES, tier);
async function calculateFare(from, to, tier = 'luxury') {
  if (!validTier(tier)) throw new QuoteError(400, 'INVALID_TIER', 'Selecciona una categoría de servicio válida.');
  const rates = SERVICE_RATES[tier];
  const key = JSON.stringify([from, to, tier]);
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
  const transportFare = rates.base + miles * rates.mile + minutes * rates.minute;
  const quote = { tier, miles, minutes, base: rates.base, mileage: miles * rates.mile, time: minutes * rates.minute, airportFee,
    amount: Math.round(Math.max(rates.minimum, transportFare + airportFee) * 100), currency: "usd" };
  if (quoteCache.size >= 500) quoteCache.delete(quoteCache.keys().next().value);
  const transportOnlyCents = Math.round(Math.max(rates.minimum, transportFare) * 100);
  Object.defineProperty(quote, "transportOnlyCents", {value: transportOnlyCents});
  quoteCache.set(key, { value: quote, expires: Date.now() + 300000 });
  return quote;
}
app.post("/api/quote", async (req, res) => {
  const { from, to, tier = 'luxury' } = req.body || {};
  if (!validAddresses(from, to)) return res.status(400).json({ code: "INVALID_ADDRESS", error: "Escribe las dos direcciones (máximo 200 caracteres cada una)." });
  try { res.setHeader("Cache-Control", "no-store"); res.json(await calculateFare(from.trim(), to.trim(), tier)); }
  catch (error) { sendError(res, error); }
});

async function calculateRoundTrip(body) {
  const { roundTripTotals, validReturnSchedule } = require("./round-trip/pricing");
  const { from, to, date, time, returnDate, returnTime, tier = "luxury" } = body;
  if (!validAddresses(from, to) || !validTier(tier) ||
      !validReturnSchedule(date, time, returnDate, returnTime)) {
    throw new QuoteError(400, "INVALID_ROUND_TRIP", "Check pickup, destination, and return schedule.");
  }
  const outbound = await calculateFare(from.trim(), to.trim(), tier);
  const inbound = await calculateFare(to.trim(), from.trim(), tier);
  const airportExtrasCents = outbound.amount - outbound.transportOnlyCents + inbound.amount - inbound.transportOnlyCents;
  const totals = roundTripTotals(outbound.transportOnlyCents, inbound.transportOnlyCents, airportExtrasCents);
  return { tripType: "round_trip", tier, from: from.trim(), to: to.trim(),
    date, time, returnDate, returnTime, outbound, inbound, ...totals,
    discountPercent: 10, currency: "usd" };
}

// Round-trip preview only: does not create bookings, dispatch trips or charge cards.
app.post("/api/round-trip-quote", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const quote = await calculateRoundTrip(req.body || {});
    let bookingAvailable=roundTripTest;
    if (roundTripForward) {
      bookingAvailable=await roundTripForward.verifyReady().then(()=>true,()=>false);
    }
    return res.json({ ...quote, status: "estimate_only", bookingAvailable });
  } catch (error) {
    return sendError(res, error);
  }
});

// Test-only bridge to a loopback dispatch process and its isolated database.
const roundTripTest = process.env.NODE_ENV === "test" && Boolean(process.env.ROUND_TRIP_TEST_INTAKE_PORT);
const roundTripProduction = process.env.NODE_ENV === "production" &&
  process.env.ROUND_TRIP_PRODUCTION_ENABLED === "true" &&
  process.env.BOOKING_DISPATCH_PRODUCTION_ENABLED === "true";
const roundTripForward = roundTripProduction ? require("./booking/production-dispatch-sender").createProductionDispatchSender({
  endpoint: process.env.BOOKING_DISPATCH_URL,
  promotedProductionHost: process.env.BOOKING_DISPATCH_PROMOTED_HOST,
  secret: process.env.BOOKING_SERVICE_SECRET, enabled: true, roundTrip: true
}) : null;
if (roundTripTest || roundTripProduction) {
  const intakePort = Number(process.env.ROUND_TRIP_TEST_INTAKE_PORT);
  const secret = process.env.BOOKING_SERVICE_SECRET;
  if (roundTripTest && (!Number.isInteger(intakePort) || intakePort < 1 || intakePort > 65535 ||
      !secret || Buffer.byteLength(secret) < 32)) {
    throw new Error("Invalid isolated round-trip intake configuration");
  }
  if (roundTripTest) app.get("/test/round-trip-calculator", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(require("node:path").join(__dirname, "calculadora-gps-pimentel.html"));
  });
  const recentSubmissions = new Map();
  app.post(roundTripTest ? "/api/test/round-trip-request" : "/api/round-trip-request", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body || {};
    const { name, phone, email, passengers, expectedFareCents } = body;
    const validText = (value, maximum) =>
      typeof value === "string" && value.trim() === value && value.length > 0 && value.length <= maximum;
    if (!validText(name, 100) || !validText(phone, 40) || !validText(email, 254) ||
        !emailPattern.test(email) || (passengers != null && !validText(passengers, 20)) ||
        !Number.isSafeInteger(expectedFareCents) || expectedFareCents < 0) {
      return res.status(400).json({ error: "Invalid booking details." });
    }
    try {
      if (roundTripProduction) {
        const now = Date.now();
        for (const [ip, expiry] of recentSubmissions) {
          if (expiry <= now) recentSubmissions.delete(ip);
        }
        if (recentSubmissions.has(req.ip) || recentSubmissions.size >= 2000) return res.sendStatus(429);
        recentSubmissions.set(req.ip, now + 15000);
      }
      const quote = await calculateRoundTrip(body);
      if (expectedFareCents !== quote.totalCents) {
        return res.status(409).json({ code: "FARE_CHANGED", fareCents: quote.totalCents });
      }
      const reference = "PT-" + require("node:crypto").randomBytes(8).toString("hex").toUpperCase();
      const { from, to, date, time, returnDate, returnTime, tier } = quote;
      const booking = { reference, name, phone, email, passengers, from, to, date, time,
        returnDate, returnTime, tier, fareCents: quote.totalCents, extrasCents: quote.extrasCents, tipCents: 0 };
      let stored;
      if (roundTripForward) {
        stored = await roundTripForward(booking);
      } else {
        const response = await fetch("http://127.0.0.1:" + intakePort + "/booking-staging/round-trip-intake", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Booking-Service-Key": secret },
          redirect: "error",
          signal: AbortSignal.timeout(5000),
          body: JSON.stringify(booking)
        });
        stored = response.status === 201 ? await response.json() : null;
      }
      if (stored?.stored !== true || stored.reference !== reference || stored.status !== "pending") {
        throw new Error("Invalid test intake acknowledgement");
      }
      return res.status(201).json({ reference, status: "pending", fareCents: quote.totalCents });
    } catch (error) {
      if (error instanceof QuoteError) return sendError(res, error);
      return res.status(502).json({ code: "INTAKE_UNVERIFIED", error: "Booking receipt could not be verified." });
    }
  });
}

app.post("/api/create-checkout-session", async (req, res) => {
  // Fail closed: the legacy one-way flow must never silently accept round-trip details.
  if (req.body?.tripType === "round_trip" || req.body?.returnDate != null || req.body?.returnTime != null) {
    return res.status(409).json({ code: "ROUND_TRIP_NOT_ENABLED", error: "Round-trip booking and payment are not yet available. / Las reservas y pagos de ida y vuelta aún no están disponibles." });
  }
  if (!stripe) {
    return res.status(503).json({ error: "Stripe is not configured" });
  }

  const { from, to, customerName, phone, tipPercent = 0, tipCents = 0, expectedFareCents, paymentKind = "ride", tier = 'luxury' } = req.body || {};

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
      !Number.isSafeInteger(expectedFareCents) || expectedFareCents < 0 || !validTier(tier)) {
    return res.status(400).json({ error: "Propina o datos de pago inválidos." });
  }
  try {
    const { amount } = await calculateFare(from.trim(), to.trim(), tier);
    if (amount !== expectedFareCents) return res.status(409).json({ error: "La tarifa cambió. Vuelve a calcular y revisa el total antes de pagar." });
    const gratuity = tipPercent ? Math.round(amount * tipPercent / 100) : tipCents;
    if (paymentKind === "tip_only" && gratuity < 50) return res.status(400).json({ error: "Para pagar solo la propina, elige al menos $0.50." });
    const lineItems = [];
    if (paymentKind === "ride") lineItems.push({price_data:{currency:"usd",unit_amount:amount,product_data:{name:"Pimentel Transportation - "+(tier==='comfort'?'Comfort Private Ride':'Executive Black SUV')}},quantity:1});
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
        tier,
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
  // Fail closed: the legacy one-way flow must never silently accept round-trip details.
  if (req.body?.tripType === "round_trip" || req.body?.returnDate != null || req.body?.returnTime != null) {
    return res.status(409).json({ code: "ROUND_TRIP_NOT_ENABLED", error: "Round-trip booking and payment are not yet available. / Las reservas y pagos de ida y vuelta aún no están disponibles." });
  }
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
  const tier = clean(body.tier || 'luxury', 20);
  const tipPercent = Number(body.tipPercent), tipCents = Number(body.tipCents);
  const quotePending = body.quotePending === true;
  if (!name || !phone || !emailPattern.test(email) || !validAddresses(from, to) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) ||
      (!quotePending && (!Number.isSafeInteger(body.expectedFareCents) || body.expectedFareCents < 0)) ||
      ![0, 10, 15, 20].includes(tipPercent) || !Number.isSafeInteger(tipCents) ||
      tipCents < 0 || tipCents > 100000 || (tipPercent > 0 && tipCents > 0) ||
      !["later", "coordinate"].includes(payment) || !validTier(tier)) {
    return res.status(400).json({ error: "Revisa los datos de la reserva." });
  }
  bookingThrottle.set(ip, Date.now());
  try {
    if (quotePending && process.env.BOOKING_DISPATCH_PRODUCTION_ENABLED !== "true")
      return res.status(503).json({error:"La recepción de cotizaciones no está disponible. Contacta a la compañía."});
    const fare = quotePending ? {amount:null} : await calculateFare(from, to, tier);
    if (!quotePending && fare.amount !== body.expectedFareCents) return res.status(409).json({ error: "La tarifa cambió. Calcula nuevamente antes de reservar." });
    const tip = quotePending && tipPercent ? 0 : tipPercent ? Math.round(fare.amount * tipPercent / 100) : tipCents;
    const dollars = cents => "$" + (cents / 100).toFixed(2);
    const reference = "PT-" + require("node:crypto").randomBytes(8).toString("hex").toUpperCase();
    let dispatchStored = false;
    // Forward to the dedicated production dispatch only after explicit activation.
    // Do not send to staging or confirm the booking when intake fails.
    if (process.env.BOOKING_DISPATCH_PRODUCTION_ENABLED === "true") {
      const {createProductionDispatchSender} = require("./booking/production-dispatch-sender");
      const forward = createProductionDispatchSender({
        enabled: true,
        endpoint: process.env.BOOKING_DISPATCH_URL,
        promotedProductionHost: process.env.BOOKING_DISPATCH_PROMOTED_HOST,
        secret: process.env.BOOKING_SERVICE_SECRET
      });
      const ack = await forward({
        reference, name, phone, email, from, to, date, time, passengers,
        payment, tier, fareCents: fare.amount, tipCents: tip, quotePending, details: quotePending ? details + "\nTarifa pendiente de cotización. Preferencia de propina: " + tipPercent + "% / " + tipCents + " cents" : details
      });
      if (!ack || ack.stored !== true || ack.reference !== reference)
        throw new Error("Dispatch intake acknowledgement invalid");
      dispatchStored = true;
    }
    const summary = [
      "Solicitud: " + reference, "Nombre: " + name, "Correo: " + email,
      "Teléfono: " + phone, "Fecha: " + date, "Hora: " + time,
      "Categoría: " + (tier==='comfort'?'Comfort Private Ride':'Executive Black SUV'),
      "Recogida: " + from, "Destino: " + to, "Pasajeros: " + passengers,
      "Tarifa estimada: " + (quotePending ? "PENDIENTE DE COTIZACIÓN" : dollars(fare.amount)), "Propina opcional: " + dollars(tip),
      "Total estimado: " + (quotePending ? "PENDIENTE DE COTIZACIÓN" : dollars(fare.amount + tip)),
      "Pago: " + payment, "Detalles: " + details,
      "Estado: PENDIENTE DE CONFIRMACIÓN"
    ].join("\n");
    let adminNoticeSent = false;
    try {
    await sendBookingEmail({
      to: notificationEmail,
      replyTo: email,
      subject: "Nueva solicitud de reserva " + reference,
      text: summary
    });
    adminNoticeSent = true;
    } catch (error) {
      // A persisted request remains received even when the email provider fails.
      if (!dispatchStored) throw error;
      console.error("Admin notification failed after dispatch persistence");
    }
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
    res.json({ reference, received: true, customerNoticeSent, adminNoticeSent });
  } catch (error) {
    console.error("Booking request failed:", error.message);
    if (error.status) return sendError(res, error);
    res.status(502).json({ error: "No se pudo enviar la solicitud. Intenta nuevamente o utiliza WhatsApp." });
  }
});

// Safe rollout preflight: report configuration presence only, never secrets or customer data.
// This endpoint does not forward bookings, charge cards, or change existing behavior.
app.get("/api/integration-preflight", (req, res) => {
  res.set("Cache-Control", "no-store");
  const checks = {
    stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY),
    emailConfigured: Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL),
    dispatchEndpointConfigured: Boolean(process.env.BOOKING_DISPATCH_URL),
    dispatchAuthenticationConfigured: Boolean(process.env.BOOKING_SERVICE_SECRET && Buffer.byteLength(process.env.BOOKING_SERVICE_SECRET) >= 32)
  };
  res.json({
    service: "booking-production-preflight",
    configurationReady: Object.values(checks).every(Boolean),
    checks,
    forwardingEnabled: process.env.BOOKING_DISPATCH_PRODUCTION_ENABLED === "true",
    note: "Configuration presence only; does not verify dispatch connectivity, persistence, email delivery, or payment"
  });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Payment server listening on port", PORT);
});
