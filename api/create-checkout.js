const Stripe = require('stripe');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const ALLOWED_ORIGINS = [
  'https://www.vooruit.nl',
  'https://vooruit.nl',
  'https://vooruit.webflow.io',
  'https://vooruit-91196d.webflow.io',
  'http://localhost:3000'
];

module.exports = async function handler(req, res) {
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

  try {
    const { amount, frequency, donationType, firstName, lastName, email, message, successUrl, cancelUrl } = req.body;

    const amountNumber = parseInt(amount);
    if (!amountNumber || amountNumber < 1 || amountNumber > 50000) {
      return res.status(400).json({ error: 'Ongeldig bedrag' });
    }

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Ongeldig e-mailadres' });
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
        success_url: successUrl || 'https://vooruit.nl/bedankt',
        cancel_url: cancelUrl || 'https://vooruit.nl/doneren',
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
        success_url: successUrl || 'https://vooruitproject.nl/bedankt',
        cancel_url: cancelUrl || 'https://vooruitproject.nl/steun-vooruit',
        locale: 'nl'
      });
    }

    return res.status(200).json({ url: session.url, sessionId: session.id });

  } catch (error) {
    console.error('Stripe error:', error);
    return res.status(500).json({ error: 'Er ging iets mis', details: error.message });
  }
};
