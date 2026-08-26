const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5031;
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

async function verifyPhoneAndFormValidation() {
  console.log('--- VERIFYING STRICT PHONE NUMBER & FORM VALIDATIONS ---\n');

  let server;
  let userId, userToken;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Form Validation Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const testEmail = `validation_test_${Date.now()}@example.com`;

    // 1. Signup with invalid phone number (< 10 digits or invalid chars)
    const invalidPhoneRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Validation Tester',
      email: testEmail,
      password: 'Password123!',
      phone: '123', // Too short (invalid)
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    if (invalidPhoneRes.status !== 400) {
      console.error('❌ TEST 1 FAILED: Expected 400 Bad Request for short phone number:', invalidPhoneRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Signup with invalid phone number rejected with 400 Bad Request');

    // 2. Signup with valid international phone number (+91 9876543210)
    const validSignupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Validation Tester',
      email: testEmail,
      password: 'Password123!',
      phone: '+91 9876543210',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    if (validSignupRes.status !== 201 || !validSignupRes.body.token) {
      console.error('❌ TEST 2 FAILED: Valid signup failed:', validSignupRes.body);
      process.exit(1);
    }
    userId = validSignupRes.body.user.id;
    userToken = validSignupRes.body.token;
    console.log('✅ TEST 2 PASSED: Signup with valid phone (+91 9876543210) created account successfully');

    // 3. PUT /api/auth/me with invalid phone number
    const invalidUpdateRes = await makeRequest('PUT', '/api/auth/me', {
      phone: 'invalid-phone-string',
    }, { Authorization: `Bearer ${userToken}` });

    if (invalidUpdateRes.status !== 400) {
      console.error('❌ TEST 3 FAILED: Expected 400 for invalid phone update:', invalidUpdateRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Profile update with invalid phone string rejected with 400 Bad Request');

    // 4. PUT /api/auth/me with valid phone number
    const validUpdateRes = await makeRequest('PUT', '/api/auth/me', {
      phone: '+1 (555) 234-5678',
    }, { Authorization: `Bearer ${userToken}` });

    if (validUpdateRes.status !== 200 || validUpdateRes.body.user.phone !== '+1 (555) 234-5678') {
      console.error('❌ TEST 4 FAILED: Valid phone update failed:', validUpdateRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: Profile update with valid E.164 phone (+1 (555) 234-5678) succeeded');

    console.log('\n🎉 ALL PHONE NUMBER & FORM VALIDATION VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyPhoneAndFormValidation();
