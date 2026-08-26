const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5023;
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

async function verifyBookMyShowCitySelector() {
  console.log('--- VERIFYING BOOKMYSHOW CITY SELECTOR & TOP PICKS IN SELECTED CITY ---\n');

  let server;
  let userToken, userId, coimbatoreEventId, blrEventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[BookMyShow City Selector Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'City Selector Host',
      email: `city_selector_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      city: 'Coimbatore',
    });
    userToken = signupRes.body.token;
    userId = signupRes.body.user.id;

    // 2. Create Event in Coimbatore
    const cRes = await makeRequest('POST', '/api/events', {
      title: 'Coimbatore Music Fest ' + Date.now(),
      description: 'Live concert in Coimbatore',
      category: 'music',
      location: 'VOC Park Grounds',
      neighborhood: 'Gandhipuram',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      city: 'Coimbatore',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 50,
    }, { Authorization: `Bearer ${userToken}` });
    coimbatoreEventId = cRes.body.id;

    // 3. Create Event in Bengaluru
    const bRes = await makeRequest('POST', '/api/events', {
      title: 'Bengaluru Tech Expo ' + Date.now(),
      description: 'Tech conference in Bengaluru',
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
    if (bRes.status !== 201) {
      console.error('❌ bRes creation failed with status', bRes.status, bRes.body);
      process.exit(1);
    }
    blrEventId = bRes.body.id;

    // 4. Test Unauthenticated Guest Feed for Coimbatore: GET /api/events/feed?city=Coimbatore
    const coimbatoreFeedRes = await makeRequest('GET', '/api/events/feed?city=Coimbatore');
    if (coimbatoreFeedRes.status !== 200 || coimbatoreFeedRes.body.userLocation.city !== 'Coimbatore') {
      console.error('❌ TEST 1 FAILED: Feed did not return Top Picks for Coimbatore:', coimbatoreFeedRes.body);
      process.exit(1);
    }
    const hasCoimbatoreEvent = coimbatoreFeedRes.body.topPicks.some(e => e.id === coimbatoreEventId);
    if (!hasCoimbatoreEvent) {
      console.error('❌ TEST 1 FAILED: Coimbatore event missing from Top Picks in Coimbatore:', coimbatoreFeedRes.body.topPicks);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Unauthenticated guest feed returned "Top Picks in Coimbatore" correctly!');

    // 5. Test Unauthenticated Guest Feed for Bengaluru: GET /api/events/feed?city=Bengaluru&limit=50
    const blrFeedRes = await makeRequest('GET', '/api/events/feed?city=Bengaluru&limit=50');
    if (blrFeedRes.status !== 200 || blrFeedRes.body.userLocation.city !== 'Bengaluru') {
      console.error('❌ TEST 2 FAILED: Feed did not return Top Picks for Bengaluru:', blrFeedRes.body);
      process.exit(1);
    }
    const hasBlrEvent = blrFeedRes.body.topPicks.some(e => e.id === blrEventId);
    if (!hasBlrEvent) {
      console.error('❌ TEST 2 FAILED: Bengaluru event missing from Top Picks in Bengaluru:', blrFeedRes.body.topPicks);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Unauthenticated guest feed returned "Top Picks in Bengaluru" correctly!');

    console.log('\n🎉 ALL BOOKMYSHOW CITY SELECTOR & TOP PICKS VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (coimbatoreEventId) await prisma.event.deleteMany({ where: { id: coimbatoreEventId } });
    if (blrEventId) await prisma.event.deleteMany({ where: { id: blrEventId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyBookMyShowCitySelector();
