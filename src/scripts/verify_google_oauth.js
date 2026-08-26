const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5028;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyStr = data ? JSON.stringify(data) : '';
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    if (data) reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => (responseBody += chunk));
      res.on('end', () => {
        let parsed = responseBody;
        if (responseBody) {
          try { parsed = JSON.parse(responseBody); } catch (e) {}
        }
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    req.on('error', (err) => reject(err));
    if (data) req.write(bodyStr);
    req.end();
  });
}

async function verifyGoogleOAuth() {
  console.log('--- VERIFYING GOOGLE OAUTH 2.0 ENDPOINT & PROVISIONING ---\n');

  let server;
  let userToken, userId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Google OAuth Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const googleEmail = `google_user_${Date.now()}@gmail.com`;
    const googleId = `google_sub_${Date.now()}`;

    // 1. First Google Sign-In (Creates User Account)
    const oauthRes1 = await makeRequest('POST', '/api/auth/google', {
      email: googleEmail,
      name: 'Google Test User',
      google_id: googleId,
      city: 'Bengaluru',
      state: 'Karnataka',
      country: 'India',
    });

    if (oauthRes1.status !== 200 || !oauthRes1.body.token || !oauthRes1.body.user.google_id) {
      console.error('❌ TEST 1 FAILED: Initial Google OAuth failed:', oauthRes1.body);
      process.exit(1);
    }
    userToken = oauthRes1.body.token;
    userId = oauthRes1.body.user.id;
    console.log('✅ TEST 1 PASSED: Initial Google OAuth created account & returned JWT token');

    // 2. Subsequent Google Sign-In (Logins Existing User)
    const oauthRes2 = await makeRequest('POST', '/api/auth/google', {
      email: googleEmail,
      name: 'Google Test User',
      google_id: googleId,
    });

    if (oauthRes2.status !== 200 || oauthRes2.body.user.id !== userId) {
      console.error('❌ TEST 2 FAILED: Subsequent Google OAuth failed:', oauthRes2.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Subsequent Google OAuth logged in existing account cleanly');

    // 3. GET /api/auth/me verifies Google user profile
    const meRes = await makeRequest('GET', '/api/auth/me', null, { Authorization: `Bearer ${userToken}` });
    if (meRes.status !== 200 || meRes.body.user.email !== googleEmail) {
      console.error('❌ TEST 3 FAILED: Profile check failed:', meRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Verified authenticated session for Google user');

    console.log('\n🎉 ALL GOOGLE OAUTH 2.0 VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyGoogleOAuth();
