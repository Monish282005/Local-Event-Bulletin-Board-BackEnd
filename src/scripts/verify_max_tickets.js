const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5020;
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

async function verifyMaxTickets() {
  console.log('--- VERIFYING MAXIMUM 10 TICKETS PER BOOKING PERMITTED ---\n');

  let server;
  let userToken, userId, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Max Tickets Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Max Tickets User',
      email: `max_tickets_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;

    // 2. Create Event with 50 tickets
    const eRes = await makeRequest('POST', '/api/events', {
      title: 'Max Tickets Event ' + Date.now(),
      description: 'Testing max 10 tickets per booking',
      category: 'music',
      location: 'Stadium',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 50,
    }, { Authorization: `Bearer ${userToken}` });
    eventId = eRes.body.id;

    // 3. Attempt Booking 11 tickets -> Expected 400 Bad Request
    const overMaxRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 11,
    }, { Authorization: `Bearer ${userToken}` });

    if (overMaxRes.status !== 400 || !overMaxRes.body.error.includes('Maximum 10 tickets')) {
      console.error('❌ TEST 1 FAILED: Booking 11 tickets was not blocked:', overMaxRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Request for 11 tickets strictly rejected with 400 Bad Request!');

    // 4. Attempt Booking 10 tickets -> Expected 200 OK (Pass #1 to #10)
    const validMaxRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 10,
    }, { Authorization: `Bearer ${userToken}` });

    if (validMaxRes.status !== 200 || validMaxRes.body.quantity_registered !== 10 || validMaxRes.body.ticket_numbers.length !== 10) {
      console.error('❌ TEST 2 FAILED: Booking 10 tickets failed:', validMaxRes.body);
      process.exit(1);
    }
    console.log(`✅ TEST 2 PASSED: Successfully booked 10 tickets in a single pass (Issued Pass #${validMaxRes.body.ticket_numbers.join(', #')})`);

    console.log('\n🎉 ALL MAXIMUM TICKETS VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyMaxTickets();
