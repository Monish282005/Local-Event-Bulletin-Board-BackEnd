const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5019;
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

async function verifyAuthBooking() {
  console.log('--- VERIFYING AUTHENTICATION REQUIREMENT FOR EVENT BOOKING ---\n');

  let server;
  let userToken, userId, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Auth Booking Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Auth Booking User',
      email: `auth_booking_${Date.now()}@example.com`,
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
      title: 'Auth Ticket Event ' + Date.now(),
      description: 'Testing login requirement for booking',
      category: 'music',
      location: 'Hall 1',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 50,
    }, { Authorization: `Bearer ${userToken}` });
    eventId = eRes.body.id;

    // 3. Attempt Booking WITHOUT token -> Expected 401 Unauthorized
    const unauthBookingRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 1,
    });

    if (unauthBookingRes.status !== 401) {
      console.error('❌ TEST 1 FAILED: Unauthenticated booking was not blocked:', unauthBookingRes.status, unauthBookingRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unauthenticated booking request strictly rejected with 401 Unauthorized!');

    // 4. Attempt Booking WITH token -> Expected 200 OK
    const authBookingRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 1,
    }, { Authorization: `Bearer ${userToken}` });

    if (authBookingRes.status !== 200 || authBookingRes.body.rsvp_count !== 1) {
      console.error('❌ TEST 2 FAILED: Authenticated booking failed:', authBookingRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Authenticated booking request succeeded cleanly (200 OK)');

    console.log('\n🎉 ALL AUTHENTICATED BOOKING VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyAuthBooking();
