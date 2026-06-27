const { initFirebaseAdmin } = require('./firebase-admin-setup');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ error: 'Missing reference' });
  }

  try {
    const admin = initFirebaseAdmin();
    const db = admin.firestore();

    // Verify the transaction securely directly with SebPay API
    const sebpayResponse = await fetch(`https://newapi.sebpay.bj/api/v1/collections/${reference}`, {
      method: 'GET',
      headers: {
        'X-Public-Key': process.env.SEBPAY_PUBLIC_KEY,
        'X-Secret-Key': process.env.SEBPAY_SECRET_KEY
      }
    });

    const sebpayData = await sebpayResponse.json();

    if (!sebpayData.success) {
      return res.status(400).json({ error: 'Verification failed' });
    }

    const verifiedStatus = sebpayData.data.status;
    
    // Update the transaction in Firestore if it was approved or rejected
    const txRef = db.collection('transactions').doc(reference);
    const txDoc = await txRef.get();

    if (txDoc.exists) {
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
      } else if (txData.status !== 'rejected' && (verifiedStatus === 'rejected' || verifiedStatus === 'failed')) {
         await txRef.update({
          status: 'rejected',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }

    return res.status(200).json({ success: true, status: verifiedStatus });

  } catch (error) {
    console.error('Check Status Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
