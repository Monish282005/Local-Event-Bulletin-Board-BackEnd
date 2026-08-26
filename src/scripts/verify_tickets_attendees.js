const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5012;
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

async function verifyTicketsAndAttendees() {
  console.log('--- VERIFYING TICKETING CAPACITY & ATTENDEE REGISTRATIONS ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Tickets & Attendees Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  let organizerRes, aliceRes, bobRes, eventId;

  try {
    // 1. Create Organizer & 2 Attendees
    organizerRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Event Organizer',
      email: `organizer_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const organizerToken = organizerRes.body.token;

    const user1Res = await makeRequest('POST', '/api/auth/signup', {
      name: 'Alice Johnson',
      email: `alice_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const user1Token = user1Res.body.token;

    const user2Res = await makeRequest('POST', '/api/auth/signup', {
      name: 'Bob Smith',
      email: `bob_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const user2Token = user2Res.body.token;

    // 2. Organizer creates event with total_tickets = 2
    const createRes = await makeRequest('POST', '/api/events', {
      title: 'Limited Capacity Workshop ' + Date.now(),
      description: 'Exclusive 2-seat workshop',
      category: 'other',
      location: 'Tech Hub Room A',
      neighborhood: 'Koramangala',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 2,
    }, { Authorization: `Bearer ${organizerToken}` });

    if (createRes.status !== 201 || createRes.body.total_tickets !== 2) {
      console.error('❌ TEST 1 FAILED: Expected total_tickets = 2, got:', createRes.body);
      process.exit(1);
    }
    const eventId = createRes.body.id;
    console.log('✅ TEST 1 PASSED: Event created with total_tickets = 2');

    // 3. User 1 registers for Ticket #1
    const rsvp1Res = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {}, { Authorization: `Bearer ${user1Token}` });
    if (rsvp1Res.status !== 200 || rsvp1Res.body.ticket_number !== 1 || rsvp1Res.body.rsvp_count !== 1) {
      console.error('❌ TEST 2 FAILED: Expected ticket_number=1, rsvp_count=1, got:', rsvp1Res.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Alice registered & issued Ticket #1');

    // 4. User 2 registers for Ticket #2
    const rsvp2Res = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {}, { Authorization: `Bearer ${user2Token}` });
    if (rsvp2Res.status !== 200 || rsvp2Res.body.ticket_number !== 2 || rsvp2Res.body.rsvp_count !== 2) {
      console.error('❌ TEST 3 FAILED: Expected ticket_number=2, rsvp_count=2, got:', rsvp2Res.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Bob registered & issued Ticket #2');

    // 5. User 3 attempts registration when capacity is full -> Expected 400 Sold Out
    const rsvp3Res = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {}, { Authorization: `Bearer ${organizerToken}` });
    if (rsvp3Res.status !== 400 || !rsvp3Res.body.error.includes('sold out')) {
      console.error('❌ TEST 4 FAILED: Expected 400 Sold Out error, got:', rsvp3Res.status, rsvp3Res.body);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: Sold out event correctly rejected extra registration');

    // 6. Non-owner attempting to view attendees -> Expected 403 Forbidden
    const unauthAttendeesRes = await makeRequest('GET', `/api/events/${eventId}/attendees`, null, { Authorization: `Bearer ${user1Token}` });
    if (unauthAttendeesRes.status !== 403) {
      console.error('❌ TEST 5 FAILED: Expected 403 Forbidden for non-owner, got:', unauthAttendeesRes.status);
      process.exit(1);
    }
    console.log('✅ TEST 5 PASSED: Non-owner blocked from viewing attendees (403)');

    // 7. Organizer views attendees -> Expected 2 attendees with full details
    const attendeesRes = await makeRequest('GET', `/api/events/${eventId}/attendees`, null, { Authorization: `Bearer ${organizerToken}` });
    if (attendeesRes.status !== 200 || attendeesRes.body.attendees.length !== 2) {
      console.error('❌ TEST 6 FAILED: Invalid attendees response:', attendeesRes.body);
      process.exit(1);
    }
    const names = attendeesRes.body.attendees.map(a => a.user_name);
    if (!names.includes('Alice Johnson') || !names.includes('Bob Smith')) {
      console.error('❌ TEST 6 FAILED: Attendee names missing in list:', names);
      process.exit(1);
    }
    console.log(`✅ TEST 6 PASSED: Organizer fetched ${attendeesRes.body.attendees.length} registered attendees with ticket details!`);

    console.log('\n🎉 ALL TICKETING & ATTENDEES VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (eventId) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (organizerRes?.body?.user?.id) {
      await prisma.user.deleteMany({ where: { id: organizerRes.body.user.id } });
    }
    if (aliceRes?.body?.user?.id) {
      await prisma.user.deleteMany({ where: { id: aliceRes.body.user.id } });
    }
    if (bobRes?.body?.user?.id) {
      await prisma.user.deleteMany({ where: { id: bobRes.body.user.id } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyTicketsAndAttendees();
