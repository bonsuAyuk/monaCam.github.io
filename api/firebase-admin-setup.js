const admin = require('firebase-admin');

function initFirebaseAdmin() {
  if (!admin.apps.length) {
    try {
      // Look for the FIREBASE_SERVICE_ACCOUNT environment variable
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      
      if (!serviceAccountJson) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is not set');
      }

      const serviceAccount = JSON.parse(serviceAccountJson);

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } catch (error) {
      console.error('Firebase admin initialization error', error);
    }
  }
  return admin;
}

module.exports = { initFirebaseAdmin };
