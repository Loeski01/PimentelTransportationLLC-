
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
const stripe = stripeKey ? new Stripe(stripeKey) : null;

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

  const { from, to, customerName, phone } = req.body || {};

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

  try {
    const { amount } = await calculateFare(from.trim(), to.trim());

    const session = await stripe.checkout.sessions.create({
      ui_mode: "hosted",
      mode: "payment",
      billing_address_collection: "required",
      phone_number_collection: { enabled: true },
      automatic_tax: { enabled: false },
      allow_promotion_codes: false,
      submit_type: "auto",
      customer_creation: "always",
      line_items: [{
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: "Pimentel Transportation - Private Transfer"
          }
        },
        quantity: 1
      }],
      metadata: {
        from: from.trim(),
        to: to.trim(),
        customerName: customerName.trim(),
        phone: phone.trim()
      },
      success_url: CALCULATOR + "?payment=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: CALCULATOR + "?payment=cancelled"
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error("Checkout creation failed:", error.message);
    sendError(res, error);
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Payment server listening on port", PORT);
});
