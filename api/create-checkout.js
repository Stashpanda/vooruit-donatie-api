const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ============================================
// CONFIGURATIE
// ============================================
const ALLOWED_ORIGINS = [
  'https://www.vooruitproject.nl',
  'https://vooruit.webflow.io',
  'https://vooruit-91196d.webflow.io',
  'http://localhost:3000'
];

// FIX #3: URLs hardcoded in backend — niet meer afhankelijk van frontend input
const SUCCESS_URL = 'https://vooruitproject.nl/bedankt';
const CANCEL_URL = 'https://vooruitproject.nl/steun-vooruit';

// FIX #6: Simpele in-memory rate limiting (per IP, max 10 requests per minuut)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, windowStart: now });
    return false;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true;
  }

  entry.count++;
  return false;
}

// FIX #4: Betere e-mailvalidatie met regex
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ============================================

module.exports = async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // FIX #6: Rate limiting check
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Te veel verzoeken. Probeer het later opnieuw.' });
  }

  try {
    // FIX #3: successUrl en cancelUrl worden NIET meer uit req.body gehaald
    const { amount, frequency, donationType, firstName, lastName, email, message } = req.body;

    // Validatie: bedrag
    const amountNumber = parseInt(amount);
    if (!amountNumber || amountNumber < 1 || amountNumber > 50000) {
      return res.status(400).json({ error: 'Ongeldig bedrag. Voer een bedrag in tussen €1 en €50.000.' });
    }

    // FIX #4: Betere e-mailvalidatie
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres.' });
    }

    // Validatie: verplichte velden
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'Naam is verplicht.' });
    }

    // Validatie: frequentie
    if (!['onetime', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Ongeldige frequentie.' });
    }

    const amountInCents = amountNumber * 100;
    const donationDescription = 'VoorUit Donatie - ' + (donationType || 'Algemeen');

    const metadata = {
      donationType: donationType || 'algemeen',
      firstName: firstName,
      lastName: lastName,
      message: message || '',
      frequency: frequency
    };

    let session;

    if (frequency === 'monthly') {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['ideal', 'card'],
        mode: 'subscription',
        customer_email: email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: donationDescription
            },
            unit_amount: amountInCents,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }],
        subscription_data: { metadata: metadata },
        // FIX #3: Hardcoded URLs
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        locale: 'nl'
      });
    } else {
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['ideal', 'card'],
        mode: 'payment',
        customer_email: email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: donationDescription
            },
            unit_amount: amountInCents
          },
          quantity: 1
        }],
        payment_intent_data: { metadata: metadata },
        // FIX #3: Hardcoded URLs
        success_url: SUCCESS_URL,
        cancel_url: CANCEL_URL,
        locale: 'nl'
      });
    }

    // Alleen de URL teruggeven — geen sessionId nodig in de frontend
    return res.status(200).json({ url: session.url });

  } catch (error) {
    // FIX #2: Geen interne foutdetails terugsturen naar de client
    console.error('Stripe error:', error);
    return res.status(500).json({ error: 'Er ging iets mis. Probeer het opnieuw.' });
  }
};
