const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5021;
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

async function verifyRouting() {
  console.log('--- VERIFYING FULL ROUTING ENDPOINTS & DEEP LINK SUPPORT ---\n');

  let server;
  let userToken, userId, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Routing Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Routing Test User',
      email: `routing_user_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;

    // 2. Create Event
    const eRes = await makeRequest('POST', '/api/events', {
      title: 'Routing Event Test ' + Date.now(),
      description: 'Testing full page routing support',
      category: 'music',
      location: 'Grand Stadium',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 50,
    }, { Authorization: `Bearer ${userToken}` });
    eventId = eRes.body.id;

    // 3. Register for event
    await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 2,
    }, { Authorization: `Bearer ${userToken}` });

    // 4. Test My Events Route endpoint GET /api/events/my-events
    const myEventsRes = await makeRequest('GET', '/api/events/my-events', null, { Authorization: `Bearer ${userToken}` });
    if (myEventsRes.status !== 200 || !myEventsRes.body.events || myEventsRes.body.events.length === 0) {
      console.error('❌ TEST 1 FAILED: GET /api/events/my-events failed for /my-events page route:', myEventsRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: /my-events page route endpoint returned user created events correctly');

    // 5. Test My Bookings Route endpoint GET /api/events/my-bookings
    const myBookingsRes = await makeRequest('GET', '/api/events/my-bookings', null, { Authorization: `Bearer ${userToken}` });
    if (myBookingsRes.status !== 200 || !myBookingsRes.body.bookings || myBookingsRes.body.bookings.length === 0) {
      console.error('❌ TEST 2 FAILED: GET /api/events/my-bookings failed for /my-bookings page route:', myBookingsRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: /my-bookings page route endpoint returned user ticket passes correctly');

    // 6. Test Event Detail Route endpoint GET /api/events/:id
    const detailRes = await makeRequest('GET', `/api/events/${eventId}`);
    if (detailRes.status !== 200 || !detailRes.body.id) {
      console.error('❌ TEST 3 FAILED: GET /api/events/:id failed for /event/:id page route:', detailRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: /event/:id page route endpoint returned event detail payload correctly');

    console.log('\n🎉 ALL ROUTING VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyRouting();
