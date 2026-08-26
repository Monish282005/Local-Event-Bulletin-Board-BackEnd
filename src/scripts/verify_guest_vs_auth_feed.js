const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5022;
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

async function verifyGuestVsAuthFeed() {
  console.log('--- VERIFYING GUEST VS AUTHENTICATED PERSONALIZED FEED ---\n');

  let server;
  let userToken, userId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Guest vs Auth Feed Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Unauthenticated feed request
    const guestFeedRes = await makeRequest('GET', '/api/events/feed');
    if (guestFeedRes.status !== 200 || guestFeedRes.body.userLocation.isAuthenticated !== false) {
      console.error('❌ TEST 1 FAILED: Guest feed did not return isAuthenticated=false:', guestFeedRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unauthenticated guest feed returned top picks with isAuthenticated=false');

    // 2. Signup User with specific location (Chennai, Tamil Nadu)
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Personalized User',
      email: `personalized_user_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Chennai',
      city: 'Chennai',
    });
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;

    // 3. Authenticated feed request
    const authFeedRes = await makeRequest('GET', '/api/events/feed', null, { Authorization: `Bearer ${userToken}` });
    if (authFeedRes.status !== 200 || authFeedRes.body.userLocation.isAuthenticated !== true || authFeedRes.body.userLocation.city !== 'Chennai') {
      console.error('❌ TEST 2 FAILED: Authenticated feed did not return user location profile:', authFeedRes.body);
      process.exit(1);
    }
    console.log(`✅ TEST 2 PASSED: Authenticated feed correctly customized tier locations for user (${authFeedRes.body.userLocation.city}, ${authFeedRes.body.userLocation.state})`);

    console.log('\n🎉 GUEST VS AUTHENTICATED PERSONALIZED FEED VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyGuestVsAuthFeed();
