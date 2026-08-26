const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5016;
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

async function verifyPagination() {
  console.log('--- VERIFYING MY EVENTS & MY BOOKINGS PAGINATION ---\n');

  let server;
  let userToken, userId;
  const createdEventIds = [];

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Pagination Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Pagination User',
      email: `pagination_user_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;

    // 2. Create 12 Events for this user
    for (let i = 1; i <= 12; i++) {
      const eRes = await makeRequest('POST', '/api/events', {
        title: `Paginated Event #${i}`,
        description: `Description #${i}`,
        category: 'music',
        location: `Venue #${i}`,
        neighborhood: 'Indiranagar',
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        event_datetime: new Date(Date.now() + i * 3600000).toISOString(),
        total_tickets: 50,
      }, { Authorization: `Bearer ${userToken}` });
      createdEventIds.push(eRes.body.id);
    }

    // 3. Register for 10 events (to test my-bookings pagination)
    for (let i = 0; i < 10; i++) {
      await makeRequest('POST', `/api/events/${createdEventIds[i]}/rsvp`, {
        ticket_quantity: 1,
      }, { Authorization: `Bearer ${userToken}` });
    }

    // 4. Verify My Events Pagination (Page 1 = 9 items, Total = 12, TotalPages = 2)
    const myEvPage1 = await makeRequest('GET', '/api/events/my-events?page=1&limit=9', null, { Authorization: `Bearer ${userToken}` });
    if (myEvPage1.status !== 200 || !myEvPage1.body.pagination) {
      console.error('❌ TEST 1 FAILED: My Events pagination response invalid:', myEvPage1.body);
      process.exit(1);
    }
    const myEvPag = myEvPage1.body.pagination;
    if (myEvPage1.body.events.length !== 9 || myEvPag.total !== 12 || myEvPag.totalPages !== 2 || !myEvPag.hasNextPage) {
      console.error('❌ TEST 1 FAILED: My Events Page 1 mismatch:', myEvPag);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: My Events Page 1 returned 9 items with totalPages=2 & hasNextPage=true');

    // 5. Verify My Events Page 2 (3 items, hasPrevPage = true, hasNextPage = false)
    const myEvPage2 = await makeRequest('GET', '/api/events/my-events?page=2&limit=9', null, { Authorization: `Bearer ${userToken}` });
    if (myEvPage2.body.events.length !== 3 || !myEvPage2.body.pagination.hasPrevPage || myEvPage2.body.pagination.hasNextPage) {
      console.error('❌ TEST 2 FAILED: My Events Page 2 mismatch:', myEvPage2.body.pagination);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: My Events Page 2 returned remaining 3 items with hasPrevPage=true & hasNextPage=false');

    // 6. Verify My Bookings Pagination (10 bookings, Page 1 = 9 items, TotalPages = 2)
    const myBkPage1 = await makeRequest('GET', '/api/events/my-bookings?page=1&limit=9', null, { Authorization: `Bearer ${userToken}` });
    if (myBkPage1.status !== 200 || !myBkPage1.body.pagination) {
      console.error('❌ TEST 3 FAILED: My Bookings pagination response invalid:', myBkPage1.body);
      process.exit(1);
    }
    const myBkPag = myBkPage1.body.pagination;
    if (myBkPage1.body.bookings.length !== 9 || myBkPag.total !== 10 || myBkPag.totalPages !== 2 || !myBkPag.hasNextPage) {
      console.error('❌ TEST 3 FAILED: My Bookings Page 1 mismatch:', myBkPag);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: My Bookings Page 1 returned 9 items with totalPages=2 & hasNextPage=true');

    // 7. Verify My Bookings Page 2 (1 item, hasPrevPage = true)
    const myBkPage2 = await makeRequest('GET', '/api/events/my-bookings?page=2&limit=9', null, { Authorization: `Bearer ${userToken}` });
    if (myBkPage2.body.bookings.length !== 1 || !myBkPage2.body.pagination.hasPrevPage) {
      console.error('❌ TEST 4 FAILED: My Bookings Page 2 mismatch:', myBkPage2.body.pagination);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: My Bookings Page 2 returned remaining 1 item with hasPrevPage=true');

    console.log('\n🎉 ALL MY EVENTS & MY BOOKINGS PAGINATION VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (createdEventIds.length > 0) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: { in: createdEventIds } } });
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyPagination();
