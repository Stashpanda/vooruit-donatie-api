const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Allowed origins - voeg je eigen domein toe
const ALLOWED_ORIGINS = [
  'https://www.vooruit.nl',  // Vervang met je echte domein
  'https://vooruit.nl',
  'https://vooruit.webflow.io', // Je Webflow staging domein
  'http://localhost:3000'  // Voor lokaal testen
];

export default async function handler(req, res) {
  // CORS headers
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      amount, 
      frequency, 
      donationType, 
      firstName, 
      lastName, 
      email, 
      message,
      successUrl,
      cancelUrl
    } = req.body;

    // Validatie
    const amountNumber = parseInt(amount);
    if (!amountNumber || amountNumber < 1 || amountNumber > 50000) {
      return res.status(400).json({ error: 'Ongeldig bedrag (min €1, max €50.000)' });
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
    }

    if (!['onetime', 'monthly'].includes(frequency)) {
      return res.status(400).json({ error: 'Ongeldige frequentie' });
    }

    // Bedrag in centen voor Stripe
    const amountInCents = amountNumber * 100;

    // Donatie beschrijving
    const donationDescription = `VoorUit Donatie - ${donationType || 'Algemeen'}`;

    // Metadata voor administratie
    const metadata = {
      donationType: donationType || 'algemeen',
      firstName,
      lastName,
      message: message || '',
      frequency
    };

    let session;

    if (frequency === 'monthly') {
      // MAANDELIJKSE DONATIE - Subscription via Checkout
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['ideal', 'card'],
        mode: 'subscription',
        customer_email: email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: donationDescription,
              description: `Maandelijkse donatie van €${amountNumber}`
            },
            unit_amount: amountInCents,
            recurring: {
              interval: 'month'
            }
          },
          quantity: 1
        }],
        subscription_data: {
          metadata: metadata
        },
        success_url: successUrl || 'https://vooruit.nl/bedankt',
        cancel_url: cancelUrl || 'https://vooruit.nl/doneren',
        locale: 'nl'
      });
    } else {
      // EENMALIGE DONATIE - Payment via Checkout
      session = await stripe.checkout.sessions.create({
        payment_method_types: ['ideal', 'card'],
        mode: 'payment',
        customer_email: email,
        line_items: [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: donationDescription,
              description: `Eenmalige donatie van €${amountNumber}`
            },
            unit_amount: amountInCents
          },
          quantity: 1
        }],
        payment_intent_data: {
          metadata: metadata
        },
        success_url: successUrl || 'https://vooruit.nl/bedankt',
        cancel_url: cancelUrl || 'https://vooruit.nl/doneren',
        locale: 'nl'
      });
    }

    // Return checkout URL
    return res.status(200).json({ 
      url: session.url,
      sessionId: session.id 
    });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ 
      error: 'Er ging iets mis bij het aanmaken van de betaling',
      details: error.message 
    });
  }
}
