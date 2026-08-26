const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const healthRouter = require('../routes/health');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5008;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/', healthRouter);
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

async function verifyModule18() {
  console.log('--- VERIFYING MODULE 18: HIERARCHICAL EVENT FEED API ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Module 18 Verification] Server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  const createdUserIds = [];
  const createdEventIds = [];

  try {
    // 1. Create a user in Bengaluru, Karnataka, India
    const userEmail = `feed_user_${Date.now()}@example.com`;
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Feed User',
      email: userEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    const userToken = signupRes.body.token;
    const userId = signupRes.body.user.id;
    createdUserIds.push(userId);

    // 2. Create events in 3 distinct tiers + 1 expired event
    const now = Date.now();
    const cityEventId = uuidv4();
    const stateEventId = uuidv4();
    const countryEventId = uuidv4();
    const expiredEventId = uuidv4();

    // City Event (Bengaluru)
    await prisma.event.create({
      data: {
        id: cityEventId,
        title: 'Bengaluru Tech Meetup',
        description: 'Local city event',
        category: 'other',
        location: 'Indiranagar Club',
        neighborhood: 'Indiranagar',
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        event_datetime: new Date(now + 86400000),
        is_expired: false,
        created_by: userId,
      },
    });
    createdEventIds.push(cityEventId);

    // State Event (Mysuru, Karnataka)
    await prisma.event.create({
      data: {
        id: stateEventId,
        title: 'Mysuru Palace Cultural Fest',
        description: 'State event outside city',
        category: 'music',
        location: 'Palace Grounds',
        neighborhood: 'Central Mysuru',
        country: 'India',
        state: 'Karnataka',
        district: 'Mysuru',
        city: 'Mysuru',
        event_datetime: new Date(now + 172800000),
        is_expired: false,
        created_by: userId,
      },
    });
    createdEventIds.push(stateEventId);

    // Country Event (Mumbai, Maharashtra)
    await prisma.event.create({
      data: {
        id: countryEventId,
        title: 'Mumbai Food Carnival',
        description: 'Country event outside state',
        category: 'food',
        location: 'Marine Drive',
        neighborhood: 'Colaba',
        country: 'India',
        state: 'Maharashtra',
        district: 'Mumbai City',
        city: 'Mumbai',
        event_datetime: new Date(now + 259200000),
        is_expired: false,
        created_by: userId,
      },
    });
    createdEventIds.push(countryEventId);

    // Expired Event (Bengaluru)
    await prisma.event.create({
      data: {
        id: expiredEventId,
        title: 'Expired Past Concert',
        description: 'Expired event',
        category: 'music',
        location: 'Loc',
        neighborhood: 'Downtown',
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        event_datetime: new Date(now - 3600000),
        is_expired: true,
        created_by: userId,
      },
    });
    createdEventIds.push(expiredEventId);

    // 3. Query GET /api/events/feed with User Token
    const feedRes = await makeRequest('GET', '/api/events/feed', null, {
      Authorization: `Bearer ${userToken}`,
    });

    if (feedRes.status !== 200 || !feedRes.body.topPicks) {
      console.error('❌ TEST 1 FAILED: Feed response invalid:', feedRes.status, feedRes.body);
      process.exit(1);
    }

    const { topPicks, stateEvents, countryEvents } = feedRes.body;

    // Check topPicks
    const topPickIds = topPicks.map((e) => e.id);
    const stateEventIds = stateEvents.map((e) => e.id);
    const countryEventIds = countryEvents.map((e) => e.id);

    if (topPickIds.includes(cityEventId)) {
      console.log('✅ TEST 1 PASSED: City event appears in topPicks tier');
    } else {
      console.error('❌ TEST 1 FAILED: City event not found in topPicks');
      process.exit(1);
    }

    if (stateEventIds.includes(stateEventId) && !stateEventIds.includes(cityEventId)) {
      console.log('✅ TEST 2 PASSED: State event appears in stateEvents tier (excluding city event)');
    } else {
      console.error('❌ TEST 2 FAILED: State events tier classification failed');
      process.exit(1);
    }

    if (countryEventIds.includes(countryEventId) && !countryEventIds.includes(stateEventId)) {
      console.log('✅ TEST 3 PASSED: Country event appears in countryEvents tier (excluding state/city events)');
    } else {
      console.error('❌ TEST 3 FAILED: Country events tier classification failed');
      process.exit(1);
    }

    // Check Mutual Exclusivity
    const allTierIds = [...topPickIds, ...stateEventIds, ...countryEventIds];
    const uniqueIds = new Set(allTierIds);
    if (allTierIds.length === uniqueIds.size) {
      console.log('✅ TEST 4 PASSED: All tiers are strictly mutually exclusive (no duplicate events across tiers)');
    } else {
      console.error('❌ TEST 4 FAILED: Duplicate events found across tiers');
      process.exit(1);
    }

    // Check Expired Event exclusion
    if (!allTierIds.includes(expiredEventId)) {
      console.log('✅ TEST 5 PASSED: Expired events are excluded from all feed tiers');
    } else {
      console.error('❌ TEST 5 FAILED: Expired event appeared in feed');
      process.exit(1);
    }

    // Check EXPLAIN plan in MySQL for performance
    const dbUrl = process.env.DATABASE_URL;
    const url = new URL(dbUrl);
    const connection = await mysql.createConnection({
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port) : 3306,
      user: url.username || 'root',
      password: url.password || 'root',
      database: url.pathname.replace('/', '') || 'event',
    });

    const [explainTopPicks] = await connection.query(
      "EXPLAIN SELECT * FROM events WHERE country = 'India' AND state = 'Karnataka' AND city = 'Bengaluru' AND is_expired = false ORDER BY event_datetime ASC LIMIT 12;"
    );

    console.log('\nMYSQL EXPLAIN FOR FEED QUERY:');
    console.log(`  - Key used: ${explainTopPicks[0].key || explainTopPicks[0].possible_keys}`);
    console.log(`  - Query type: ${explainTopPicks[0].type}`);

    await connection.end();
    console.log('\n🎉 ALL MODULE 18 VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    if (createdEventIds.length > 0) {
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
    if (server) server.close();
  }
}

verifyModule18().catch((err) => {
  console.error('Module 18 verification error:', err);
  process.exit(1);
});
