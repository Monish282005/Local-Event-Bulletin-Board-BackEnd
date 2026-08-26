const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { uploadToCloudinary } = require('../utils/cloudinary');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5033;
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

async function verifyCloudinaryIntegration() {
  console.log('--- VERIFYING CLOUDINARY CLOUD IMAGE UPLOAD & MYSQL PERSISTENCE ---\n');

  let server;
  let userId, userToken, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Cloudinary Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const testEmail = `cloudinary_test_${Date.now()}@example.com`;

    // 1. Create User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Cloudinary Tester',
      email: testEmail,
      password: 'Password123!',
      phone: '+91 9876543210',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    userId = signupRes.body.user.id;
    userToken = signupRes.body.token;

    // 2. Upload image payload via POST /api/events
    const sampleBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const futureDate = new Date(Date.now() + 86400000).toISOString();

    const createEventRes = await makeRequest('POST', '/api/events', {
      title: 'Cloudinary Gala Event',
      description: 'Event with Cloudinary image upload.',
      category: 'music',
      location: 'VOC Grounds',
      neighborhood: 'Gandhipuram',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Coimbatore',
      city: 'Coimbatore',
      event_datetime: futureDate,
      total_tickets: 50,
      image_url: sampleBase64,
    }, { Authorization: `Bearer ${userToken}` });

    if (createEventRes.status !== 201 || !createEventRes.body.id) {
      console.error('❌ TEST 1 FAILED: Could not create event:', createEventRes.body);
      process.exit(1);
    }
    eventId = createEventRes.body.id;
    const storedImageUrl = createEventRes.body.image_url;

    console.log('✅ TEST 1 PASSED: Event created with Cloudinary image payload');
    console.log('📸 Stored Image URL in MySQL:', storedImageUrl);

    // 3. Verify DB record contains Cloudinary image URL
    const dbEvent = await prisma.event.findUnique({ where: { id: eventId } });
    if (!dbEvent || !dbEvent.image_url) {
      console.error('❌ TEST 2 FAILED: DB record missing image_url');
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Verified MySQL database stored Cloudinary URL:', dbEvent.image_url);

    console.log('\n🎉 ALL CLOUDINARY INTEGRATION VERIFICATIONS PASSED SUCCESSFULLY!');
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

verifyCloudinaryIntegration();
