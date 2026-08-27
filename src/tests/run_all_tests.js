const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const healthRouter = require('../routes/health');
const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');
const { runExpirationWorker } = require('../workers/expirationWorker');

const prisma = new PrismaClient();

// Setup Test Express Server on isolated port 5005
const app = express();
const TEST_PORT = 5005;
const BASE_URL = `http://localhost:${TEST_PORT}`;

app.use(cors());
app.use(express.json());
app.use('/', healthRouter);
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

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

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('       RUNNING BACKEND AUTOMATED TEST SUITE          ');
  console.log('======================================================\n');

  let server;
  let passedCount = 0;
  let totalCount = 12;

  // Start test server
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Test Runner] Test server active on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  const createdUserIds = [];
  const createdEventIds = [];

  try {
    // --- 1. AUTH TESTS ---
    console.log('--- AREA 1: AUTHENTICATION API TESTS ---');

    // Test 1: Signup weak password rejection (< 8 chars)
    const t1 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Weak Pass',
      email: `weak_${Date.now()}@example.com`,
      password: '123',
    });
    if (t1.status === 400) {
      console.log('  ✅ [TEST 1 PASSED] Signup with weak password (< 8 chars) rejected with 400 Bad Request');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 1 FAILED] Expected 400, got ${t1.status}`);
    }

    // Test 2: Valid signup
    const testEmail1 = `owner_${Date.now()}@example.com`;
    const t2 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Test Owner',
      email: testEmail1,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const user1Token = t2.body.token;
    const user1Id = t2.body.user?.id;
    if (user1Id) createdUserIds.push(user1Id);

    if (t2.status === 201 && user1Token && !t2.body.user.password_hash) {
      console.log('  ✅ [TEST 2 PASSED] Valid signup created user, returned token, and stripped password_hash');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 2 FAILED] Valid signup failed, got ${t2.status}`);
    }

    // Test 3: Signup duplicate email rejection (409)
    const t3 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Dup User',
      email: testEmail1,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    if (t3.status === 409) {
      console.log('  ✅ [TEST 3 PASSED] Signup with duplicate email rejected with 409 Conflict');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 3 FAILED] Expected 409 for duplicate email, got ${t3.status}`);
    }

    // Test 4: Login failure with generic message (401)
    const t4 = await makeRequest('POST', '/api/auth/login', {
      email: testEmail1,
      password: 'wrongPassword!',
    });
    if (t4.status === 401 && t4.body.error === 'Invalid email or password.') {
      console.log('  ✅ [TEST 4 PASSED] Login with incorrect password returned 401 with generic error message');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 4 FAILED] Login failure test failed, got ${t4.status}`);
    }

    // Test 5: Protected route rejection without token (401)
    const t5 = await makeRequest('GET', '/api/auth/me');
    if (t5.status === 401) {
      console.log('  ✅ [TEST 5 PASSED] Protected route (/api/auth/me) rejected request without token (401)');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 5 FAILED] Expected 401 for missing token, got ${t5.status}`);
    }


    // --- 2. EVENT CRUD VALIDATION & SORTING TESTS ---
    console.log('\n--- AREA 2: EVENT CRUD & SORTING TESTS ---');

    // Test 6: Creating event with past date (400)
    const t6 = await makeRequest('POST', '/api/events', {
      title: 'Past Event Test',
      description: 'Desc',
      category: 'sports',
      location: 'Stadium',
      neighborhood: 'Downtown',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() - 3600000).toISOString(),
    }, { Authorization: `Bearer ${user1Token}` });

    if (t6.status === 400) {
      console.log('  ✅ [TEST 6 PASSED] Creating event with past date rejected with 400 Bad Request');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 6 FAILED] Expected 400 for past date, got ${t6.status}`);
    }

    // Test 7: Creating event with missing required field (400)
    const t7 = await makeRequest('POST', '/api/events', {
      title: 'Incomplete Event',
      // missing description
      category: 'music',
      location: 'Park',
      neighborhood: 'Downtown',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
    }, { Authorization: `Bearer ${user1Token}` });

    if (t7.status === 400) {
      console.log('  ✅ [TEST 7 PASSED] Creating event with missing field rejected with 400 Bad Request');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 7 FAILED] Expected 400 for missing field, got ${t7.status}`);
    }

    // Test 8: Out-of-order inserts and sorting order correctness (ascending event_datetime)
    const future1 = new Date(Date.now() + 10 * 86400000).toISOString();
    const future2 = new Date(Date.now() + 2 * 86400000).toISOString();
    const future3 = new Date(Date.now() + 5 * 86400000).toISOString();

    const e1 = await makeRequest('POST', '/api/events', {
      title: 'Late Event', description: 'Desc', category: 'music', location: 'Loc', neighborhood: 'Downtown', country: 'India', state: 'Karnataka', district: 'Bengaluru Urban', city: 'Bengaluru', event_datetime: future1,
    }, { Authorization: `Bearer ${user1Token}` });
    const e2 = await makeRequest('POST', '/api/events', {
      title: 'Early Event', description: 'Desc', category: 'music', location: 'Loc', neighborhood: 'Downtown', country: 'India', state: 'Karnataka', district: 'Bengaluru Urban', city: 'Bengaluru', event_datetime: future2,
    }, { Authorization: `Bearer ${user1Token}` });
    const e3 = await makeRequest('POST', '/api/events', {
      title: 'Mid Event', description: 'Desc', category: 'food', location: 'Loc', neighborhood: 'Northside', country: 'India', state: 'Karnataka', district: 'Bengaluru Urban', city: 'Bengaluru', event_datetime: future3,
    }, { Authorization: `Bearer ${user1Token}` });


    if (e1.body.id) createdEventIds.push(e1.body.id);
    if (e2.body.id) createdEventIds.push(e2.body.id);
    if (e3.body.id) createdEventIds.push(e3.body.id);

    const listRes = await makeRequest('GET', '/api/events');
    const dates = (listRes.body || []).map(e => new Date(e.event_datetime).getTime());
    let isSorted = true;
    for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] > dates[i + 1]) {
        isSorted = false;
        break;
      }
    }

    if (listRes.status === 200 && isSorted && dates.length >= 3) {
      console.log('  ✅ [TEST 8 PASSED] GET /api/events returns active events sorted by event_datetime ascending');
      passedCount++;
    } else {
      console.error('  ❌ [TEST 8 FAILED] Sorting order test failed');
    }

    // Test 9: Non-owner attempting PUT/DELETE returns 403 Forbidden
    const testEmail2 = `nonowner_${Date.now()}@example.com`;
    const signup2 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Non Owner',
      email: testEmail2,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const user2Token = signup2.body.token;
    if (signup2.body.user?.id) createdUserIds.push(signup2.body.user.id);


    const nonOwnerPut = await makeRequest('PUT', `/api/events/${e1.body.id}`, { title: 'Hacked' }, { Authorization: `Bearer ${user2Token}` });
    const nonOwnerDel = await makeRequest('DELETE', `/api/events/${e1.body.id}`, null, { Authorization: `Bearer ${user2Token}` });

    if (nonOwnerPut.status === 403 && nonOwnerDel.status === 403) {
      console.log('  ✅ [TEST 9 PASSED] Non-owner attempting PUT/DELETE received 403 Forbidden');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 9 FAILED] Expected 403 for non-owner, got PUT: ${nonOwnerPut.status}, DEL: ${nonOwnerDel.status}`);
    }


    // --- 3. EXPIRATION WORKER & CONCURRENCY TESTS ---
    console.log('\n--- AREA 3: EXPIRATION WORKER & CONCURRENCY TESTS ---');

    // Test 10: Expiration worker logic (past event set to is_expired=true and excluded from GET list)
    const pastEvId = uuidv4();
    await prisma.event.create({
      data: {
        id: pastEvId,
        title: 'Past Expired Event',
        description: 'Testing worker',
        category: 'other',
        location: 'Loc',
        neighborhood: 'Downtown',
        event_datetime: new Date(Date.now() - 3600000),
        is_expired: false,
        created_by: user1Id,
      },
    });
    createdEventIds.push(pastEvId);

    const workerResult = await runExpirationWorker();
    const checkedPastEvent = await prisma.event.findUnique({ where: { id: pastEvId } });
    const updatedList = await makeRequest('GET', '/api/events');
    const returnedIds = (updatedList.body || []).map(e => e.id);

    if (workerResult >= 1 && (!checkedPastEvent || checkedPastEvent.is_expired === true || checkedPastEvent.deleted_at !== null) && !returnedIds.includes(pastEvId)) {
      console.log('  ✅ [TEST 10 PASSED] Expiration worker deleted past event and excluded it from list');
      passedCount++;
    } else {
      console.error('  ❌ [TEST 10 FAILED] Expiration worker logic test failed');
    }

    // Test 11: Expiration worker 0-row update handling without crash
    const zeroWorkerResult = await runExpirationWorker();
    if (zeroWorkerResult === 0) {
      console.log('  ✅ [TEST 11 PASSED] Expiration worker handled 0-row update cleanly without error');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 11 FAILED] Zero worker result expected 0, got ${zeroWorkerResult}`);
    }

    // Test 12: RSVP atomic increment under 20 concurrent calls (+20 count, zero lost updates)
    const rsvpPromises = [];
    for (let i = 0; i < 20; i++) {
      rsvpPromises.push(makeRequest('POST', `/api/events/${e2.body.id}/rsvp`, null, { Authorization: `Bearer ${user2Token}` }));
    }
    const rsvpResponses = await Promise.all(rsvpPromises);
    const successCount = rsvpResponses.filter(r => r.status === 200).length;
    const finalEventInDb = await prisma.event.findUnique({ where: { id: e2.body.id } });

    if (successCount === 20 && finalEventInDb.rsvp_count === 20) {
      console.log('  ✅ [TEST 12 PASSED] 20 concurrent RSVP requests resulted in exactly rsvp_count = 20 (zero lost updates)');
      passedCount++;
    } else {
      console.error(`  ❌ [TEST 12 FAILED] RSVP concurrency failed. Successes: ${successCount}, Final DB Count: ${finalEventInDb?.rsvp_count}`);
    }

  } catch (error) {
    console.error('Test execution error:', error);
  } finally {
    // Cleanup test records
    if (createdEventIds.length > 0) {
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();

    if (server) {
      server.close();
    }

    console.log('\n======================================================');
    console.log(` TEST SUMMARY: ${passedCount} / ${totalCount} TESTS PASSED`);
    console.log('======================================================\n');

    if (passedCount === totalCount) {
      console.log('🎉 ALL 12 TEST CASES PASSED SUCCESSFULLY!\n');
      process.exit(0);
    } else {
      console.error('❌ SOME TESTS FAILED.\n');
      process.exit(1);
    }
  }
}

runTestSuite();
