const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5026;
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

async function verifyProfileDashboard() {
  console.log('--- VERIFYING USER PROFILE DASHBOARD ENDPOINTS ---\n');

  let server;
  let userToken, userId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Profile Dashboard Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Create User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Dashboard Tester',
      email: `dashboard_${Date.now()}@example.com`,
      password: 'Password123!',
      phone: '+91 99999 88888',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    if (signupRes.status !== 201) {
      console.error('❌ TEST 1 FAILED: Signup failed:', signupRes.body);
      process.exit(1);
    }
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;
    console.log('✅ TEST 1 PASSED: Created user account for dashboard test');

    // 2. GET /api/auth/me returns profile info
    const meRes = await makeRequest('GET', '/api/auth/me', null, { Authorization: `Bearer ${userToken}` });
    if (meRes.status !== 200 || !meRes.body.user.email) {
      console.error('❌ TEST 2 FAILED: GET /api/auth/me failed:', meRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: GET /api/auth/me returned profile data successfully');

    // 3. PUT /api/auth/me updates name & phone
    const updateRes = await makeRequest('PUT', '/api/auth/me', {
      name: 'Updated Dashboard Name',
      phone: '+91 88888 77777',
      city: 'Mysuru',
    }, { Authorization: `Bearer ${userToken}` });

    if (updateRes.status !== 200 || updateRes.body.user.name !== 'Updated Dashboard Name' || updateRes.body.user.city !== 'Mysuru') {
      console.error('❌ TEST 3 FAILED: PUT /api/auth/me update failed:', updateRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: PUT /api/auth/me updated profile & home location');

    // 4. GET /api/events/my-events & my-bookings
    const myEventsRes = await makeRequest('GET', '/api/events/my-events', null, { Authorization: `Bearer ${userToken}` });
    const myBookingsRes = await makeRequest('GET', '/api/events/my-bookings', null, { Authorization: `Bearer ${userToken}` });

    if (myEventsRes.status !== 200 || myBookingsRes.status !== 200) {
      console.error('❌ TEST 4 FAILED: Dashboard activity queries failed');
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: My-events & My-bookings dashboard queries succeeded!');

    console.log('\n🎉 ALL PROFILE DASHBOARD VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyProfileDashboard();
