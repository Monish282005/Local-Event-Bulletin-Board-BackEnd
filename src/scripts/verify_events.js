const http = require('http');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
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

async function verifyModule3() {
  console.log('--- Starting Module 3 Event CRUD Verification ---');
  let user1Token, user2Token, user1, user2;

  try {
    // 1. Create two test users (Owner and Non-Owner)
    const email1 = `owner_${Date.now()}@example.com`;
    const email2 = `nonowner_${Date.now()}@example.com`;
    const password = 'Password123!';

    const res1 = await makeRequest('POST', '/api/auth/signup', { name: 'Owner User', email: email1, password });
    user1Token = res1.body.token;
    user1 = res1.body.user;

    const res2 = await makeRequest('POST', '/api/auth/signup', { name: 'Non-Owner User', email: email2, password });
    user2Token = res2.body.token;
    user2 = res2.body.user;

    console.log('✅ Created two test users for ownership checks.');

    // 2. Acceptance Criteria 1: Past date returns 400
    console.log('Testing creation with past date...');
    const pastDateRes = await makeRequest('POST', '/api/events', {
      title: 'Past Event',
      description: 'Test description',
      category: 'sports',
      location: '123 Main St',
      neighborhood: 'Downtown',
      event_datetime: new Date(Date.now() - 3600000).toISOString(),
    }, { Authorization: `Bearer ${user1Token}` });

    if (pastDateRes.status !== 400) {
      throw new Error(`Expected 400 for past date creation, got ${pastDateRes.status}`);
    }
    console.log('✅ Criteria 1 Passed: Creating event with past date returns 400 Bad Request.');

    // 3. Acceptance Criteria 2: Missing required field returns 400
    console.log('Testing creation with missing field...');
    const missingFieldRes = await makeRequest('POST', '/api/events', {
      title: 'Incomplete Event',
      // missing description
      category: 'music',
      location: '123 Main St',
      neighborhood: 'Downtown',
      event_datetime: new Date(Date.now() + 3600000).toISOString(),
    }, { Authorization: `Bearer ${user1Token}` });

    if (missingFieldRes.status !== 400) {
      throw new Error(`Expected 400 for missing required field, got ${missingFieldRes.status}`);
    }
    console.log('✅ Criteria 2 Passed: Creating event with missing required field returns 400 Bad Request.');

    // 4. Acceptance Criteria 3: 3+ out-of-order test inserts return sorted by event_datetime ASC
    console.log('Testing event insertion out-of-order and ascending date sorting...');
    const futureDate1 = new Date(Date.now() + 10 * 86400000).toISOString(); // +10 days
    const futureDate2 = new Date(Date.now() + 2 * 86400000).toISOString();  // +2 days (earliest)
    const futureDate3 = new Date(Date.now() + 5 * 86400000).toISOString();  // +5 days (middle)

    // Insert out of order: +10 days, +2 days, +5 days
    const e1 = await makeRequest('POST', '/api/events', {
      title: 'Late Event',
      description: 'Occurs in 10 days',
      category: 'music',
      location: 'Park A',
      neighborhood: 'Northside',
      event_datetime: futureDate1,
    }, { Authorization: `Bearer ${user1Token}` });

    const e2 = await makeRequest('POST', '/api/events', {
      title: 'Early Event',
      description: 'Occurs in 2 days',
      category: 'music',
      location: 'Park B',
      neighborhood: 'Northside',
      event_datetime: futureDate2,
    }, { Authorization: `Bearer ${user1Token}` });

    const e3 = await makeRequest('POST', '/api/events', {
      title: 'Mid Event',
      description: 'Occurs in 5 days',
      category: 'food',
      location: 'Park C',
      neighborhood: 'Downtown North',
      event_datetime: futureDate3,
    }, { Authorization: `Bearer ${user1Token}` });

    const listRes = await makeRequest('GET', '/api/events');
    if (listRes.status !== 200 || !Array.isArray(listRes.body) || listRes.body.length < 3) {
      throw new Error(`GET /api/events failed, status ${listRes.status}`);
    }

    // Verify ascending date order
    const dates = listRes.body.map(ev => new Date(ev.event_datetime).getTime());
    for (let i = 0; i < dates.length - 1; i++) {
      if (dates[i] > dates[i + 1]) {
        throw new Error(`Events not in ascending date order! ${dates[i]} > ${dates[i+1]}`);
      }
    }
    console.log('✅ Criteria 3 Passed: List endpoint returns events in ascending date order.');

    // 5. Acceptance Criteria 5: Filtering by neighborhood and category simultaneously
    console.log('Testing simultaneous neighborhood (partial case-insensitive) and category filtering...');
    // Filter by neighborhood="north" (matches "Northside" and "Downtown North") and category="music" (matches e1 and e2, excludes e3)
    const filterRes = await makeRequest('GET', '/api/events?neighborhood=north&category=music');
    if (filterRes.status !== 200 || !Array.isArray(filterRes.body)) {
      throw new Error(`Filtering GET request failed with status ${filterRes.status}`);
    }

    const filteredTitles = filterRes.body.map(ev => ev.title);
    console.log('Filtered events returned:', filteredTitles);
    if (!filteredTitles.includes('Early Event') || !filteredTitles.includes('Late Event') || filteredTitles.includes('Mid Event')) {
      throw new Error('Filtering by neighborhood and category simultaneously failed to narrow correctly!');
    }
    console.log('✅ Criteria 5 Passed: Filtering by neighborhood and category simultaneously narrowed correctly.');

    // 6. Acceptance Criteria 4: Non-owner attempting PUT/DELETE receives 403 Forbidden
    console.log('Testing non-owner PUT update rejection...');
    const targetEventId = e2.body.id;
    const nonOwnerPutRes = await makeRequest('PUT', `/api/events/${targetEventId}`, {
      title: 'Hacked Title',
    }, { Authorization: `Bearer ${user2Token}` });

    if (nonOwnerPutRes.status !== 403) {
      throw new Error(`Expected 403 for non-owner PUT, got ${nonOwnerPutRes.status}`);
    }

    console.log('Testing non-owner DELETE rejection...');
    const nonOwnerDelRes = await makeRequest('DELETE', `/api/events/${targetEventId}`, null, {
      Authorization: `Bearer ${user2Token}`,
    });

    if (nonOwnerDelRes.status !== 403) {
      throw new Error(`Expected 403 for non-owner DELETE, got ${nonOwnerDelRes.status}`);
    }
    console.log('✅ Criteria 4 Passed: Non-owner attempting PUT/DELETE receives 403 Forbidden.');

    // 7. Verify Owner PUT and DELETE work cleanly
    console.log('Testing owner PUT update...');
    const ownerPutRes = await makeRequest('PUT', `/api/events/${targetEventId}`, {
      title: 'Updated Early Event Title',
    }, { Authorization: `Bearer ${user1Token}` });

    if (ownerPutRes.status !== 200 || ownerPutRes.body.title !== 'Updated Early Event Title') {
      throw new Error(`Owner PUT update failed, got ${ownerPutRes.status}`);
    }
    console.log('✅ Owner PUT update succeeded.');

    console.log('Testing owner DELETE...');
    const ownerDelRes = await makeRequest('DELETE', `/api/events/${targetEventId}`, null, {
      Authorization: `Bearer ${user1Token}`,
    });

    if (ownerDelRes.status !== 204) {
      throw new Error(`Owner DELETE failed, got ${ownerDelRes.status}`);
    }
    console.log('✅ Owner DELETE succeeded with 204 No Content.');

    // Confirm deleted event is no longer accessible via GET /api/events/:id
    const getDeletedRes = await makeRequest('GET', `/api/events/${targetEventId}`);
    if (getDeletedRes.status !== 404) {
      throw new Error(`Expected 404 for deleted event, got ${getDeletedRes.status}`);
    }
    console.log('✅ Deleted event verified 404 Not Found.');

    console.log('\n--- ALL MODULE 3 ACCEPTANCE CRITERIA PASSED SUCCESSFULLY ---');

    // Clean up test records
    await prisma.event.deleteMany({
      where: { created_by: { in: [user1.id, user2.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [user1.id, user2.id] } },
    });
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyModule3();
