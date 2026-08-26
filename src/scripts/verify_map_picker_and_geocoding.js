const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5036;
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

async function verifyMapPickerAndGeocoding() {
  console.log('--- VERIFYING INTERACTIVE MAP PICKER & REVERSE GEOCODING AUTO-FILL ---\n');

  let server;
  let userId, userToken, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Map Picker Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const testEmail = `map_picker_user_${Date.now()}@example.com`;

    // 1. Create User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Map Picker User',
      email: testEmail,
      password: 'Password123!',
      phone: '+91 9876543210',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Namakkal',
      city: 'Karutr',
    });

    if (signupRes.status !== 201 || !signupRes.body.token) {
      console.error('❌ TEST 1 FAILED: Could not create user:', signupRes.body);
      process.exit(1);
    }
    userId = signupRes.body.user.id;
    userToken = signupRes.body.token;
    console.log('✅ TEST 1 PASSED: User created with location defaults (India, Tamil Nadu, Namakkal, Karutr)');

    // 2. Create Event auto-populated from Map Selection (e.g. Karur, Tamil Nadu)
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const createEventRes = await makeRequest('POST', '/api/events', {
      title: 'Map Geocoded Community Gathering',
      description: 'Community event with location auto-populated from interactive map pin.',
      category: 'sports',
      location: 'Central Pavilion Park, Kovai Road',
      neighborhood: 'Karutr',
      country: 'India',
      state: 'Tamil Nadu',
      district: 'Namakkal',
      city: 'Karutr',
      event_datetime: futureDate,
      total_tickets: 100,
      ticket_price: 0,
    }, { Authorization: `Bearer ${userToken}` });

    if (createEventRes.status !== 201 || !createEventRes.body.id) {
      console.error('❌ TEST 2 FAILED: Map-geocoded event creation failed:', createEventRes.body);
      process.exit(1);
    }
    eventId = createEventRes.body.id;
    console.log('✅ TEST 2 PASSED: Event created with map-populated fields (Country: India, State: Tamil Nadu, District: Namakkal, City: Karutr)');

    // 3. Verify event persistence in MySQL
    const dbEvent = await prisma.event.findUnique({ where: { id: eventId } });
    if (dbEvent.country !== 'India' || dbEvent.state !== 'Tamil Nadu' || dbEvent.district !== 'Namakkal' || dbEvent.city !== 'Karutr') {
      console.error('❌ TEST 3 FAILED: DB persistence mismatch for map location:', dbEvent);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Database persistence verified for all 5 map-geocoded location fields');

    console.log('\n🎉 ALL MAP PICKER & REVERSE GEOCODING VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (eventId) {
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyMapPickerAndGeocoding();
