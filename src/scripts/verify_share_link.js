const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5018;
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

async function verifyShareLink() {
  console.log('--- VERIFYING SHAREABLE LINK ENDPOINT & DATA --- \n');

  let server;
  let userToken, userId, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Share Link Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Signup User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Shareable Host',
      email: `share_host_${Date.now()}@example.com`,
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
      title: 'Sharable Event Test ' + Date.now(),
      description: 'Testing shareable link endpoint and parameters',
      category: 'music',
      location: 'Grand Arena',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: new Date(Date.now() + 86400000).toISOString(),
      total_tickets: 100,
    }, { Authorization: `Bearer ${userToken}` });
    eventId = eRes.body.id;

    // 3. Fetch Event Detail (as accessed by shareable link)
    const detailRes = await makeRequest('GET', `/api/events/${eventId}`);
    if (detailRes.status !== 200 || !detailRes.body.creator || detailRes.body.creator.name !== 'Shareable Host') {
      console.error('❌ TEST 1 FAILED: GET /api/events/:id did not return full creator details:', detailRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: GET /api/events/:id returned full event payload with creator details');

    console.log('\n🎉 SHAREABLE LINK VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyShareLink();
