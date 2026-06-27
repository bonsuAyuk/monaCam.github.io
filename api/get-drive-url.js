import { GoogleAuth } from 'google-auth-library';
import https from 'https';

export default async function handler(req, res) {
  // CORS setup
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileName, mimeType, uploadType } = req.body;

    if (!fileName || !mimeType) {
      return res.status(400).json({ error: 'fileName and mimeType are required' });
    }

    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      return res.status(500).json({ error: 'Server missing FIREBASE_SERVICE_ACCOUNT' });
    }

    const credentials = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

    const auth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.file']
    });

    const client = await auth.getClient();
    const tokenObj = await client.getAccessToken();
    const token = tokenObj.token;

    // Use environment variable for folder ID if set, otherwise upload to root
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    const fileMetadata = {
      name: fileName,
      mimeType: mimeType
    };

    if (folderId) {
      fileMetadata.parents = [folderId];
    }

    const metadataString = JSON.stringify(fileMetadata);

    // Request the resumable upload URL
    const uploadUrl = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'www.googleapis.com',
        path: '/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'Content-Length': Buffer.byteLength(metadataString),
          'X-Upload-Content-Type': mimeType,
          'Origin': req.headers.origin || 'https://bonsuayuk.github.io'
        }
      };

      const request = https.request(options, (response) => {
        if (response.statusCode === 200 && response.headers.location) {
          resolve(response.headers.location);
        } else {
          let data = '';
          response.on('data', (chunk) => data += chunk);
          response.on('end', () => {
            reject(new Error(`Failed to get upload URL: ${response.statusCode} - ${data}`));
          });
        }
      });

      request.on('error', (e) => reject(e));
      request.write(metadataString);
      request.end();
    });

    res.status(200).json({ uploadUrl });
  } catch (error) {
    console.error('Error getting drive upload url:', error);
    res.status(500).json({ error: error.message });
  }
}
