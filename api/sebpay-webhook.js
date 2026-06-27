const { initFirebaseAdmin } = require('./firebase-admin-setup');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const admin = initFirebaseAdmin();
    const db = admin.firestore();

    const { transaction_id, external_reference, status } = req.body;

    if (!external_reference) {
      return res.status(400).json({ error: 'Missing external_reference' });
    }

    // Always verify the transaction securely directly with SebPay API to prevent spoofing
    const sebpayResponse = await fetch(`https://newapi.sebpay.bj/api/v1/collections/${external_reference}`, {
      method: 'GET',
      headers: {
        'X-Public-Key': process.env.SEBPAY_PUBLIC_KEY,
        'X-Secret-Key': process.env.SEBPAY_SECRET_KEY
      }
    });

    const sebpayData = await sebpayResponse.json();

    if (!sebpayData.success) {
      console.error('Webhook Verification Failed:', sebpayData);
      return res.status(400).json({ error: 'Verification failed' });
    }

    const verifiedStatus = sebpayData.data.status;
    const amount = sebpayData.data.amount;

    // Update the transaction in Firestore
    const txRef = db.collection('transactions').doc(external_reference);
    const txDoc = await txRef.get();

    if (!txDoc.exists) {
      return res.status(404).json({ error: 'Transaction not found in database' });
    }

    const txData = txDoc.data();

    // Only update if it hasn't been approved yet
    if (txData.status !== 'approved' && verifiedStatus === 'approved') {
      const userId = txData.userId;
      const planId = txData.planId;

      // Calculate expiry date and limits based on plan
      let daysToAdd = 0;
      let role = 'viewer';
      let creatorPlan = 'none';
      let weeklyUploadLimit = 0;

      if (planId === 'viewer_weekly') {
        daysToAdd = 7;
        role = 'viewer';
      } else if (planId === 'viewer_monthly') {
        daysToAdd = 30;
        role = 'viewer';
      } else if (planId === 'creator_tier1') {
        daysToAdd = 30;
        role = 'creator';
        creatorPlan = 'tier1';
        weeklyUploadLimit = 5;
      } else if (planId === 'creator_tier2') {
        daysToAdd = 30;
        role = 'creator';
        creatorPlan = 'tier2';
        weeklyUploadLimit = 15;
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + daysToAdd);

      const userUpdate = {
        role: role,
        subscriptionExpiry: admin.firestore.Timestamp.fromDate(expiryDate),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (role === 'creator') {
        userUpdate['creatorProfile.plan'] = creatorPlan;
        userUpdate['creatorProfile.weeklyUploadLimit'] = weeklyUploadLimit;
      }

      // Perform a batch update
      const batch = db.batch();
      
      batch.update(txRef, {
        status: 'approved',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      batch.update(db.collection('users').doc(userId), userUpdate);

      await batch.commit();
      console.log(`Successfully processed payment for user ${userId} (Plan: ${planId})`);
    } else if (verifiedStatus === 'rejected' || verifiedStatus === 'failed') {
       await txRef.update({
        status: 'rejected',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.status(200).json({ success: true, message: 'Webhook processed successfully' });

  } catch (error) {
    console.error('Webhook Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
