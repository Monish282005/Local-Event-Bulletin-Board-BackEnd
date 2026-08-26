const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5024;
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

async function verifySoftDelete() {
  console.log('--- VERIFYING PROFESSIONAL SOFT DELETE ARCHITECTURE ---\n');

  let server;
  let userToken, userId, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Soft Delete Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Soft Delete Tester',
      email: `soft_delete_${Date.now()}@example.com`,
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
      title: 'Soft Delete Event ' + Date.now(),
      description: 'Testing professional soft delete architecture',
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

    // 3. Book 2 tickets
    await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
      ticket_quantity: 2,
    }, { Authorization: `Bearer ${userToken}` });

    // 4. Perform Soft Delete on Event: DELETE /api/events/:id
    const deleteRes = await makeRequest('DELETE', `/api/events/${eventId}`, null, {
      Authorization: `Bearer ${userToken}`,
    });

    if (deleteRes.status !== 204) {
      console.error('❌ TEST 1 FAILED: DELETE /api/events/:id did not return 204:', deleteRes);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: DELETE /api/events/:id returned 204 No Content');

    // 5. Verify event is hidden from API queries (GET /api/events/:id returns 404)
    const getRes = await makeRequest('GET', `/api/events/${eventId}`);
    if (getRes.status !== 404) {
      console.error('❌ TEST 2 FAILED: Soft-deleted event was still returned by GET API:', getRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Soft-deleted event is correctly excluded from public API queries (404 Not Found)');

    // 6. Verify row STILL EXISTS in MySQL database with deleted_at timestamp (audit trail preserved!)
    const dbRecord = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!dbRecord || !dbRecord.deleted_at) {
      console.error('❌ TEST 3 FAILED: Event was hard deleted from database instead of soft deleted:', dbRecord);
      process.exit(1);
    }
    console.log(`✅ TEST 3 PASSED: Event record preserved in MySQL with deleted_at timestamp (${dbRecord.deleted_at.toISOString()})`);

    // 7. Verify associated registrations were also soft deleted
    const dbRegistrations = await prisma.eventRegistration.findMany({
      where: { event_id: eventId },
    });
    const allSoftDeletedRegs = dbRegistrations.every((r) => r.deleted_at !== null);
    if (!allSoftDeletedRegs || dbRegistrations.length !== 2) {
      console.error('❌ TEST 4 FAILED: EventRegistrations were not properly soft deleted:', dbRegistrations);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: All associated EventRegistration records soft-deleted with deleted_at timestamp');

    console.log('\n🎉 ALL PROFESSIONAL SOFT DELETE VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifySoftDelete();
