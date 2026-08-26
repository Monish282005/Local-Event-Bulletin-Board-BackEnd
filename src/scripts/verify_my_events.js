const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5011;
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

async function verifyMyEvents() {
  console.log('--- VERIFYING MY CREATED EVENTS ENDPOINT ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[My Events Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Unauthenticated request should return 401
    const unauthRes = await makeRequest('GET', '/api/events/my-events');
    if (unauthRes.status !== 401) {
      console.error('❌ TEST 1 FAILED: Expected 401 for unauthenticated request, got:', unauthRes.status);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unauthenticated request rejected with 401');

    // 2. Signup User A
    const userAEmail = `user_a_${Date.now()}@example.com`;
    const signupARes = await makeRequest('POST', '/api/auth/signup', {
      name: 'User A',
      email: userAEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const tokenA = signupARes.body.token;

    // 3. User A creates an event
    const eventRes = await makeRequest('POST', '/api/events', {
      title: 'User A Event ' + Date.now(),
      description: 'Event created by User A',
      category: 'sports',
      location: 'Stadium',
      neighborhood: 'Koramangala',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
    }, { Authorization: `Bearer ${tokenA}` });

    if (eventRes.status !== 201) {
      console.error('❌ TEST 2 FAILED: Event creation failed:', eventRes.body);
      process.exit(1);
    }
    const createdEventId = eventRes.body.id;
    console.log('✅ TEST 2 PASSED: User A successfully created an event');

    // 4. User A requests GET /api/events/my-events
    const myEventsRes = await makeRequest('GET', '/api/events/my-events', null, { Authorization: `Bearer ${tokenA}` });
    if (myEventsRes.status !== 200 || !Array.isArray(myEventsRes.body.events)) {
      console.error('❌ TEST 3 FAILED: Invalid my-events response format:', myEventsRes.body);
      process.exit(1);
    }

    const myEventIds = myEventsRes.body.events.map((e) => e.id);
    if (!myEventIds.includes(createdEventId)) {
      console.error('❌ TEST 3 FAILED: Created event not found in my-events response');
      process.exit(1);
    }
    console.log(`✅ TEST 3 PASSED: GET /api/events/my-events returned user's event (Total=${myEventsRes.body.pagination.total})`);

    console.log('\n🎉 ALL MY EVENTS VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyMyEvents();
