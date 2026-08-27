const http = require('http');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { runExpirationWorker } = require('../workers/expirationWorker');

dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyStr = data ? JSON.stringify(data) : '';

    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (data) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(
      url,
      {
        method,
        headers: reqHeaders,
      },
      (res) => {
        let responseBody = '';
        res.on('data', (chunk) => (responseBody += chunk));
        res.on('end', () => {
          let parsed = responseBody;
          if (responseBody) {
            try {
              parsed = JSON.parse(responseBody);
            } catch (e) {
              parsed = responseBody;
            }
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );

    req.on('error', (err) => reject(err));
    if (data) req.write(bodyStr);
    req.end();
  });
}

async function verifyModules4And5() {
  console.log('--- Starting Module 4 & 5 Verification ---');
  let testUser, testUserToken;

  try {
    // Setup test user
    const email = `worker_rsvp_${Date.now()}@example.com`;
    const userRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Worker User',
      email,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    testUser = userRes.body.user;
    testUserToken = userRes.body.token;

    // --- MODULE 4: EXPIRATION WORKER TESTS ---
    console.log('\n--- Module 4: Expiration Worker Tests ---');
    const pastEventId = uuidv4();
    await prisma.event.create({
      data: {
        id: pastEventId,
        title: 'Manually Inserted Past Event',
        description: 'Testing background worker',
        category: 'other',
        location: 'Test Location',
        neighborhood: 'Downtown',
        event_datetime: new Date(Date.now() - 3600000), // 1 hour ago
        is_expired: false,
        created_by: testUser.id,
      },
    });

    console.log('Inserted test event with past date & is_expired=false.');

    // Trigger Expiration Worker
    const updatedCount = await runExpirationWorker();
    console.log(`Expiration worker returned count: ${updatedCount}`);

    const updatedEvent = await prisma.event.findUnique({ where: { id: pastEventId } });
    if (!updatedEvent || updatedEvent.is_expired !== true) {
      throw new Error(`Expected is_expired=true for past event, got ${updatedEvent ? updatedEvent.is_expired : 'null'}`);
    }
    console.log('✅ Module 4 Criteria 1 Passed: Past event was set to is_expired=true.');

    // Check GET /api/events excludes expired event
    const listRes = await makeRequest('GET', '/api/events');
    const ids = listRes.body.map(ev => ev.id);
    if (ids.includes(pastEventId)) {
      throw new Error('Expired event still returned by GET /api/events!');
    }
    console.log('✅ Module 4 Criteria 2 Passed: Expired event excluded from GET /api/events list.');

    // Trigger worker again when 0 rows need updating
    const zeroCount = await runExpirationWorker();
    if (zeroCount !== 0) {
      throw new Error(`Expected 0 rows updated on second run, got ${zeroCount}`);
    }
    console.log('✅ Module 4 Criteria 3 Passed: Worker handled 0 updates cleanly without error.');


    // --- MODULE 5: RSVP ENDPOINT TESTS ---
    console.log('\n--- Module 5: RSVP Endpoint Tests ---');

    // 1. Invalid Event ID returns 404 Not Found
    console.log('Testing RSVP on non-existent event ID...');
    const invalidRsvpRes = await makeRequest('POST', `/api/events/non-existent-id-12345/rsvp`, null, { Authorization: `Bearer ${testUserToken}` });
    if (invalidRsvpRes.status !== 404) {
      throw new Error(`Expected 404 for invalid event ID RSVP, got ${invalidRsvpRes.status}`);
    }
    console.log('✅ Module 5 Criteria 2 Passed: Invalid event ID returns 404 Not Found.');

    // 2. RSVP on expired event returns 404 Not Found
    console.log('Testing RSVP on expired event...');
    const expiredRsvpRes = await makeRequest('POST', `/api/events/${pastEventId}/rsvp`, null, { Authorization: `Bearer ${testUserToken}` });
    if (expiredRsvpRes.status !== 404) {
      throw new Error(`Expected 404 for expired event RSVP, got ${expiredRsvpRes.status}`);
    }
    console.log('✅ Expired event RSVP returns 404 Not Found.');

    // 3. 20 Concurrent RSVP Requests
    console.log('Testing 20 concurrent RSVP requests against active event...');
    const activeEventRes = await makeRequest('POST', '/api/events', {
      title: 'Popular Active Event',
      description: 'RSVP Load Test Event',
      category: 'music',
      location: 'Stadium',
      neighborhood: 'Downtown',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
    }, { Authorization: `Bearer ${testUserToken}` });

    const activeEventId = activeEventRes.body.id;

    // Fire 20 concurrent POST requests from 20 distinct attendee users
    const rsvpPromises = [];
    for (let i = 0; i < 20; i++) {
      rsvpPromises.push((async () => {
        const u = await makeRequest('POST', '/api/auth/signup', {
          name: `Concurrent User ${i}`,
          email: `concurrent_${i}_${Date.now()}@example.com`,
          password: 'Password123!',
          country: 'India',
          state: 'Karnataka',
          district: 'Bengaluru Urban',
          city: 'Bengaluru',
        });
        return makeRequest('POST', `/api/events/${activeEventId}/rsvp`, {}, { Authorization: `Bearer ${u.body.token}` });
      })());
    }

    const rsvpResults = await Promise.all(rsvpPromises);
    const successCount = rsvpResults.filter(r => r.status === 200).length;
    if (successCount !== 20) {
      throw new Error(`Expected 20 successful RSVP responses, got ${successCount}`);
    }

    // Verify DB count
    const finalEventInDb = await prisma.event.findUnique({ where: { id: activeEventId } });
    console.log(`Final rsvp_count in database after 20 concurrent requests: ${finalEventInDb.rsvp_count}`);

    if (finalEventInDb.rsvp_count !== 20) {
      throw new Error(`Concurrency failure! Expected rsvp_count=20, got ${finalEventInDb.rsvp_count}`);
    }
    console.log('✅ Module 5 Criteria 1 Passed: 20 concurrent RSVP requests resulted in exactly rsvp_count = +20 (no lost updates).');

    console.log('\n--- ALL MODULE 4 & 5 ACCEPTANCE CRITERIA PASSED SUCCESSFULLY ---');

    // Cleanup
    await prisma.event.deleteMany({
      where: { created_by: testUser.id },
    });
    await prisma.user.delete({
      where: { id: testUser.id },
    });
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyModules4And5();
