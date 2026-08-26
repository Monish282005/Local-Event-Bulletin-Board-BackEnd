const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5030;
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

async function verifyCompleteProfileFlow() {
  console.log('--- VERIFYING GOOGLE LOGIN MISSING DETAILS & COMPLETE PROFILE FLOW ---\n');

  let server;
  let userId, userToken;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Complete Profile Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const googleEmail = `google_null_phone_${Date.now()}@gmail.com`;

    // 1. Google sign in provisions account with phone = null
    const gRes = await makeRequest('POST', '/api/auth/google', {
      email: googleEmail,
      name: 'Google Partial User',
      google_id: `g_sub_${Date.now()}`,
    });

    if (gRes.status !== 200 || !gRes.body.token || gRes.body.user.phone !== null) {
      console.error('❌ TEST 1 FAILED: Expected initial Google sign-in to create user with null phone:', gRes.body);
      process.exit(1);
    }
    userId = gRes.body.user.id;
    userToken = gRes.body.token;
    console.log('✅ TEST 1 PASSED: Initial Google sign-in created account with null phone');

    // 2. Complete missing phone number & location details via PUT /api/auth/me
    const updateRes = await makeRequest('PUT', '/api/auth/me', {
      phone: '+91 9988776655',
      city: 'Bengaluru',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      country: 'India',
    }, { Authorization: `Bearer ${userToken}` });

    if (updateRes.status !== 200 || updateRes.body.user.phone !== '+91 9988776655') {
      console.error('❌ TEST 2 FAILED: Profile update failed:', updateRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Successfully completed missing phone & profile details via PUT /api/auth/me');

    // 3. GET /api/auth/me confirms user is fully updated
    const meRes = await makeRequest('GET', '/api/auth/me', null, { Authorization: `Bearer ${userToken}` });
    if (meRes.status !== 200 || meRes.body.user.phone !== '+91 9988776655') {
      console.error('❌ TEST 3 FAILED: GET /me check failed:', meRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Verified complete user profile session');

    console.log('\n🎉 ALL COMPLETE PROFILE FLOW VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyCompleteProfileFlow();
