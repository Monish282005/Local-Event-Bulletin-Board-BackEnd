const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5032;
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

async function verifyEventImageAndInterestedButtons() {
  console.log('--- VERIFYING AUTHENTICATED "I\'M GOING" INTEREST TOGGLE ---\n');

  let server;
  let userId, userToken, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Interest Toggle Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const testEmail = `interest_toggle_${Date.now()}@example.com`;

    // 1. Create User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Interest Tester',
      email: testEmail,
      password: 'Password123!',
      phone: '+91 9876543210',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    userId = signupRes.body.user.id;
    userToken = signupRes.body.token;

    // 2. Create Event
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const createEventRes = await makeRequest('POST', '/api/events', {
      title: 'Toggle Test Festival',
      description: 'Testing select & deselect interest toggle behavior.',
      category: 'music',
      location: 'VOC Park Grounds',
      neighborhood: 'Gandhipuram',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      city: 'Coimbatore',
      event_datetime: futureDate,
      total_tickets: 50,
    }, { Authorization: `Bearer ${userToken}` });

    eventId = createEventRes.body.id;

    // 3. Test unauthenticated interest toggle -> Rejected with 401
    const guestRes = await makeRequest('POST', `/api/events/${eventId}/interested`, { action: 'add' });
    if (guestRes.status !== 401) {
      console.error('❌ TEST 1 FAILED: Expected 401 Unauthorized for guest interest click:', guestRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unauthenticated interest click rejected with 401 Unauthorized');

    // 4. Test authenticated select interest -> Increments +1
    const addRes = await makeRequest('POST', `/api/events/${eventId}/interested`, { action: 'add' }, { Authorization: `Bearer ${userToken}` });
    if (addRes.status !== 200 || addRes.body.interested_count !== 1 || !addRes.body.is_interested) {
      console.error('❌ TEST 2 FAILED: Add interest failed:', addRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Authenticated interest select incremented count to 1 (is_interested: true)');

    // 5. Test authenticated deselect interest -> Decrements -1
    const removeRes = await makeRequest('POST', `/api/events/${eventId}/interested`, { action: 'remove' }, { Authorization: `Bearer ${userToken}` });
    if (removeRes.status !== 200 || removeRes.body.interested_count !== 0 || removeRes.body.is_interested) {
      console.error('❌ TEST 3 FAILED: Remove interest failed:', removeRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Authenticated interest deselect decremented count back to 0 (is_interested: false)');

    console.log('\n🎉 ALL AUTHENTICATED INTEREST TOGGLE VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (eventId) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyEventImageAndInterestedButtons();
