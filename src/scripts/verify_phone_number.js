const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5025;
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

async function verifyPhoneNumber() {
  console.log('--- VERIFYING PHONE NUMBER INTEGRATION ACROSS SYSTEM ---\n');

  let server;
  let userToken, userId, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Phone Number Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const testPhone = '+91 9876543210';

    // 1. Signup with Phone Number
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Phone Tester',
      email: `phone_test_${Date.now()}@example.com`,
      password: 'Password123!',
      phone: testPhone,
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    if (signupRes.status !== 201 || signupRes.body.user.phone !== testPhone) {
      console.error('❌ TEST 1 FAILED: Signup with phone failed:', signupRes.body);
      process.exit(1);
    }
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;
    console.log('✅ TEST 1 PASSED: Signup stored and returned user phone number:', signupRes.body.user.phone);

    // 2. GET /api/auth/me returns phone
    const meRes = await makeRequest('GET', '/api/auth/me', null, { Authorization: `Bearer ${userToken}` });
    if (meRes.status !== 200 || meRes.body.user.phone !== testPhone) {
      console.error('❌ TEST 2 FAILED: GET /api/auth/me did not return phone:', meRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: GET /api/auth/me returned phone number successfully');

    // 3. Create Event & Book Ticket
    const eRes = await makeRequest('POST', '/api/events', {
      title: 'Phone Event ' + Date.now(),
      description: 'Testing phone registration',
      category: 'music',
      location: 'BIEC Ground',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 50,
    }, { Authorization: `Bearer ${userToken}` });
    eventId = eRes.body.id;

    const rsvpRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, { ticket_quantity: 2 }, { Authorization: `Bearer ${userToken}` });
    if (rsvpRes.status !== 200) {
      console.error('❌ TEST 3 FAILED: RSVP failed:', rsvpRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Ticket reservation succeeded');

    // 4. Organizer GET /api/events/:id/attendees includes user_phone
    const attendeesRes = await makeRequest('GET', `/api/events/${eventId}/attendees`, null, { Authorization: `Bearer ${userToken}` });
    if (attendeesRes.status !== 200 || !attendeesRes.body.grouped_attendees?.[0]?.user_phone) {
      console.error('❌ TEST 4 FAILED: Attendees list missing phone number:', attendeesRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: Organizer Attendees list includes user phone number:', attendeesRes.body.grouped_attendees[0].user_phone);

    console.log('\n🎉 ALL PHONE NUMBER INTEGRATION VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyPhoneNumber();
