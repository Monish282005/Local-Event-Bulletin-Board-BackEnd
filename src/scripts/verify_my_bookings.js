const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5014;
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

async function verifyMyBookings() {
  console.log('--- VERIFYING MY BOOKINGS ENDPOINT ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[My Bookings Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  let hostRes, buyerRes, eventId;

  try {
    // 1. Unauthenticated request -> 401
    const unauthRes = await makeRequest('GET', '/api/events/my-bookings');
    if (unauthRes.status !== 401) {
      console.error('❌ TEST 1 FAILED: Expected 401, got:', unauthRes.status);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unauthenticated request rejected with 401');

    // 2. Signup Host & Attendee
    const hostRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Bookings Host',
      email: `host_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const hostToken = hostRes.body.token;

    const buyerRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Ticket Holder',
      email: `holder_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const buyerToken = buyerRes.body.token;

    // 3. Host creates Event X
    const eventRes = await makeRequest('POST', '/api/events', {
      title: 'Grand Concert ' + Date.now(),
      description: 'Live concert performance',
      category: 'music',
      location: 'Grand Arena Stage 1',
      neighborhood: 'Koramangala',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 50,
    }, { Authorization: `Bearer ${hostToken}` });

    const eventId = eventRes.body.id;

    // 4. Buyer registers for 3 tickets for Event X
    const rsvpRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 3,
    }, { Authorization: `Bearer ${buyerToken}` });

    if (rsvpRes.status !== 200) {
      console.error('❌ TEST 2 FAILED: RSVP failed:', rsvpRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Registered 3 tickets for Grand Concert');

    // 5. Buyer calls GET /api/events/my-bookings
    const bookingsRes = await makeRequest('GET', '/api/events/my-bookings', null, { Authorization: `Bearer ${buyerToken}` });
    if (bookingsRes.status !== 200 || !Array.isArray(bookingsRes.body.bookings)) {
      console.error('❌ TEST 3 FAILED: Invalid bookings response:', bookingsRes.body);
      process.exit(1);
    }

    const item = bookingsRes.body.bookings.find(b => b.event.id === eventId);
    if (!item || item.total_user_tickets !== 3 || item.ticket_numbers.length !== 3) {
      console.error('❌ TEST 3 FAILED: Expected grouped booking with 3 tickets, got:', item);
      process.exit(1);
    }
    if (!item.event.creator || item.event.creator.name !== 'Bookings Host') {
      console.error('❌ TEST 3 FAILED: Creator details missing in booking pass:', item.event);
      process.exit(1);
    }
    console.log(`✅ TEST 3 PASSED: Grouped booking pass returned correctly! (${item.total_user_tickets} Tickets Booked: Tickets #${item.ticket_numbers.join(', #')}, Host=${item.event.creator.name})`);

    console.log('\n🎉 ALL MY BOOKINGS VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (eventId) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (hostRes?.body?.user?.id) {
      await prisma.user.deleteMany({ where: { id: hostRes.body.user.id } });
    }
    if (buyerRes?.body?.user?.id) {
      await prisma.user.deleteMany({ where: { id: buyerRes.body.user.id } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyMyBookings();
