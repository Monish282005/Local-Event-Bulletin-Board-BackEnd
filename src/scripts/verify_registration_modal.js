const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5013;
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

async function verifyRegistrationModal() {
  console.log('--- VERIFYING PERSISTENT SEARCH & MULTI-TICKET REGISTRATION ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Registration Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  let hostRes, buyerRes, eventId;

  try {
    // 1. Create Host User & Attendee
    const hostRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Sarah Organizer',
      email: `sarah_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const hostToken = hostRes.body.token;

    const buyerRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'David Buyer',
      email: `david_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const buyerToken = buyerRes.body.token;

    // 2. Create Event with total_tickets = 5
    const eventRes = await makeRequest('POST', '/api/events', {
      title: 'Family Music Fest ' + Date.now(),
      description: 'Outdoor music festival for families',
      category: 'music',
      location: 'City Park Stage',
      neighborhood: 'Koramangala',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 5,
    }, { Authorization: `Bearer ${hostToken}` });

    const eventId = eventRes.body.id;

    // 3. Verify GET /api/events/:id returns creator name & email
    const singleEventRes = await makeRequest('GET', `/api/events/${eventId}`);
    const createdEvent = singleEventRes.body;
    if (singleEventRes.status !== 200 || !createdEvent.creator || createdEvent.creator.name !== 'Sarah Organizer') {
      console.error('❌ TEST 1 FAILED: Expected creator details in GET /api/events/:id, got:', createdEvent);
      process.exit(1);
    }
    console.log(`✅ TEST 1 PASSED: Creator details present in API response (Organizer=${createdEvent.creator.name}, Email=${createdEvent.creator.email})`);

    // 4. David registers for 3 tickets via ticket_quantity
    const rsvpRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 3,
    }, { Authorization: `Bearer ${buyerToken}` });

    if (rsvpRes.status !== 200 || rsvpRes.body.rsvp_count !== 3 || rsvpRes.body.quantity_registered !== 3) {
      console.error('❌ TEST 2 FAILED: Multi-ticket registration failed:', rsvpRes.body);
      process.exit(1);
    }
    console.log(`✅ TEST 2 PASSED: David successfully registered for 3 tickets (rsvp_count=${rsvpRes.body.rsvp_count}, tickets=${rsvpRes.body.ticket_numbers.join(', ')})`);

    // 5. David attempts booking 3 more tickets when only 2 remain -> Expected 400 Bad Request
    const overflowRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 3,
    }, { Authorization: `Bearer ${buyerToken}` });

    if (overflowRes.status !== 400 || !overflowRes.body.error.includes('remaining')) {
      console.error('❌ TEST 3 FAILED: Over-capacity booking not rejected as expected:', overflowRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Over-capacity booking correctly rejected (400 Only 2 tickets remaining)');

    console.log('\n🎉 ALL REGISTRATION MODAL VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyRegistrationModal();
