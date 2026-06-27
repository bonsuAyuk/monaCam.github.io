const { initFirebaseAdmin } = require('./firebase-admin-setup');
const crypto = require('crypto');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = initFirebaseAdmin();
    const db = admin.firestore();

    const { userId, planId, phone, operator } = req.body;

    if (!userId || !planId || !phone || !operator) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Fetch the price from Firestore
    const pricingDoc = await db.collection('settings').doc('pricing').get();
    let price = 0;

    if (pricingDoc.exists) {
      const pricingData = pricingDoc.data();
      price = pricingData[planId];
    } else {
      // Fallback prices if not set in DB yet
      const fallbackPricing = {
        'viewer_weekly': 1500,
        'viewer_monthly': 2500,
        'creator_tier1': 5000,
        'creator_tier2': 10000
      };
      price = fallbackPricing[planId];
    }

    if (!price) {
      return res.status(400).json({ error: 'Invalid plan ID' });
    }

    // Generate a unique external reference
    const externalReference = `TXN-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;

    // Prepare SebPay Request
    const sebpayBody = {
      amount: price,
      currency: "XAF",
      phone: phone,
      operator: operator,
      country: "CM",
      external_reference: externalReference,
      callback_url: `${process.env.PUBLIC_SITE_URL}/api/sebpay-webhook`
    };

    const sebpayResponse = await fetch('https://newapi.sebpay.bj/api/v1/collections', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Public-Key': process.env.SEBPAY_PUBLIC_KEY,
        'X-Secret-Key': process.env.SEBPAY_SECRET_KEY
      },
      body: JSON.stringify(sebpayBody)
    });

    const sebpayData = await sebpayResponse.json();

    if (!sebpayData.success) {
      console.error('SebPay API Error:', sebpayData);
      return res.status(400).json({ error: 'Payment initiation failed', details: sebpayData.message });
    }

    // Save pending transaction to Firestore
    await db.collection('transactions').doc(externalReference).set({
      userId: userId,
      planId: planId,
      amount: price,
      status: 'pending',
      externalReference: externalReference,
      sebpayTransactionId: sebpayData.data.transaction_id || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Return success to the frontend
    return res.status(200).json({
      success: true,
      message: sebpayData.message,
      transactionId: sebpayData.data.transaction_id,
      externalReference: externalReference
    });

  } catch (error) {
    console.error('Initiate payment error:', error);
    return res.status(500).json({ error: 'Internal Server Error', message: error.message });
  }
};
