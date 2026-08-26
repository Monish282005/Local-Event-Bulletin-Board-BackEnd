const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5029;
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

async function verifyLoginNotFoundAlert() {
  console.log('--- VERIFYING LOGIN EMAIL NOT FOUND ALERT & SIGNUP FIX ---\n');

  let server;
  let userId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Login Not Found Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const nonExistentEmail = `unregistered_${Date.now()}@example.com`;

    // 1. Login with unregistered email returns 404 & notFound: true
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: nonExistentEmail,
      password: 'Password123!',
    });

    if (loginRes.status !== 404 || !loginRes.body.notFound) {
      console.error('❌ TEST 1 FAILED: Expected 404 and notFound flag for missing email:', loginRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unregistered email returns 404 status & notFound flag for frontend alert redirect');

    // 2. Signup creates account smoothly
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Signup Fix Tester',
      email: nonExistentEmail,
      password: 'Password123!',
      phone: '+91 9876543210',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    if (signupRes.status !== 201 || !signupRes.body.token) {
      console.error('❌ TEST 2 FAILED: Signup failed:', signupRes.body);
      process.exit(1);
    }
    userId = signupRes.body.user.id;
    console.log('✅ TEST 2 PASSED: Signup executed successfully and created user account');

    console.log('\n🎉 ALL LOGIN ALERT & SIGNUP FIX VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyLoginNotFoundAlert();
