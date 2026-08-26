const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5017;
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

async function verifyCancellation() {
  console.log('--- VERIFYING BOOKING CANCELLATION & SEAT RESTORATION ---\n');

  let server;
  let hostRes, buyerRes, cancellableEventId, nonCancellableEventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Cancellation Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup Host & Buyer
    hostRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Cancellation Host',
      email: `cancel_host_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const hostToken = hostRes.body.token;

    buyerRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Ticket Buyer',
      email: `cancel_buyer_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const buyerToken = buyerRes.body.token;

    // 2. Create Event A (allow_cancellation = true)
    const e1Res = await makeRequest('POST', '/api/events', {
      title: 'Refundable Workshop ' + Date.now(),
      description: 'Cancellation permitted',
      category: 'other',
      location: 'Hall A',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 10,
      allow_cancellation: true,
    }, { Authorization: `Bearer ${hostToken}` });
    cancellableEventId = e1Res.body.id;

    // 3. Create Event B (allow_cancellation = false)
    const e2Res = await makeRequest('POST', '/api/events', {
      title: 'Non-refundable Concert ' + Date.now(),
      description: 'Strict no cancellation policy',
      category: 'music',
      location: 'Arena B',
      neighborhood: 'Koramangala',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 172800000).toISOString(),
      total_tickets: 10,
      allow_cancellation: false,
    }, { Authorization: `Bearer ${hostToken}` });
    nonCancellableEventId = e2Res.body.id;

    // 4. Buyer registers 2 tickets for both events
    await makeRequest('POST', `/api/events/${cancellableEventId}/rsvp`, { ticket_quantity: 2 }, { Authorization: `Bearer ${buyerToken}` });
    await makeRequest('POST', `/api/events/${nonCancellableEventId}/rsvp`, { ticket_quantity: 2 }, { Authorization: `Bearer ${buyerToken}` });

    // Verify initial rsvp_count = 2 for both events
    const ev1Before = await makeRequest('GET', `/api/events/${cancellableEventId}`);
    if (ev1Before.body.rsvp_count !== 2) {
      console.error('❌ TEST 1 FAILED: Initial RSVP count mismatch for Event A:', ev1Before.body.rsvp_count);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Successfully registered 2 tickets for both events (rsvp_count=2)');

    // 5. Attempt cancellation on Non-cancellable event -> Expected 400 Bad Request
    const cancelNonRes = await makeRequest('DELETE', `/api/events/${nonCancellableEventId}/rsvp`, null, { Authorization: `Bearer ${buyerToken}` });
    if (cancelNonRes.status !== 400 || !cancelNonRes.body.error.includes('not allowed')) {
      console.error('❌ TEST 2 FAILED: Non-cancellable booking cancellation was not blocked:', cancelNonRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Cancellation correctly blocked for non-cancellable event (400 Ticket cancellation is not allowed)');

    // 6. Perform cancellation on Cancellable event -> Expected 200 OK & rsvp_count = 0
    const cancelRes = await makeRequest('DELETE', `/api/events/${cancellableEventId}/rsvp`, null, { Authorization: `Bearer ${buyerToken}` });
    if (cancelRes.status !== 200 || cancelRes.body.rsvp_count !== 0 || cancelRes.body.canceled_tickets_count !== 2) {
      console.error('❌ TEST 3 FAILED: Booking cancellation failed or seat count not restored:', cancelRes.body);
      process.exit(1);
    }
    console.log(`✅ TEST 3 PASSED: Booking cancelled successfully! (Restored 2 tickets, new rsvp_count=${cancelRes.body.rsvp_count})`);

    console.log('\n🎉 ALL CANCELLATION & SEAT RESTORATION VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (cancellableEventId) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: cancellableEventId } });
      await prisma.event.deleteMany({ where: { id: cancellableEventId } });
    }
    if (nonCancellableEventId) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: nonCancellableEventId } });
      await prisma.event.deleteMany({ where: { id: nonCancellableEventId } });
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

verifyCancellation();
