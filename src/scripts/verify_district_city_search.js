const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5015;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/api/events', eventsRouter);

function makeRequest(method, path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const req = http.request(url, { method }, (res) => {
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
    req.end();
  });
}

async function verifySearch() {
  console.log('--- VERIFYING DISTRICT & CITY MULTI-FIELD SEARCH ---\n');

  let server;
  const createdEventIds = [];

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Search Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const now = Date.now();
    const e1Id = uuidv4();
    const e2Id = uuidv4();

    // Event 1: City = Mysuru, District = Mysuru, Neighborhood = Gokulam
    await prisma.event.create({
      data: {
        id: e1Id,
        title: 'Gokulam Yoga Summit',
        description: 'Yoga event in Gokulam',
        category: 'sports',
        location: 'Heritage Studio',
        neighborhood: 'Gokulam',
        country: 'India',
        state: 'Karnataka',
        district: 'Mysuru District',
        city: 'Mysuru',
        event_datetime: new Date(now + 86400000),
        is_expired: false,
      },
    });
    createdEventIds.push(e1Id);

    // Event 2: City = Mangaluru, District = Dakshina Kannada, Neighborhood = Panambur
    await prisma.event.create({
      data: {
        id: e2Id,
        title: 'Panambur Beach Volleyball',
        description: 'Beach volleyball event',
        category: 'sports',
        location: 'Panambur Beach Front',
        neighborhood: 'Panambur',
        country: 'India',
        state: 'Karnataka',
        district: 'Dakshina Kannada',
        city: 'Mangaluru',
        event_datetime: new Date(now + 172800000),
        is_expired: false,
      },
    });
    createdEventIds.push(e2Id);

    // 1. Search by City ("Mysuru")
    const resCity = await makeRequest('GET', '/api/events?neighborhood=Mysuru&paginate=true');
    const eventsCity = resCity.body.events || [];
    if (!eventsCity.some(e => e.id === e1Id)) {
      console.error('❌ TEST 1 FAILED: City search for "Mysuru" did not match Event 1');
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Search by City ("Mysuru") matched Gokulam Yoga Summit');

    // 2. Search by District ("Dakshina Kannada")
    const resDist = await makeRequest('GET', '/api/events?neighborhood=Dakshina%20Kannada&paginate=true');
    const eventsDist = resDist.body.events || [];
    if (!eventsDist.some(e => e.id === e2Id)) {
      console.error('❌ TEST 2 FAILED: District search for "Dakshina Kannada" did not match Event 2');
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Search by District ("Dakshina Kannada") matched Panambur Beach Volleyball');

    // 3. Search by Neighborhood ("Panambur")
    const resNeigh = await makeRequest('GET', '/api/events?neighborhood=Panambur&paginate=true');
    const eventsNeigh = resNeigh.body.events || [];
    if (!eventsNeigh.some(e => e.id === e2Id)) {
      console.error('❌ TEST 3 FAILED: Neighborhood search for "Panambur" did not match Event 2');
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Search by Neighborhood ("Panambur") matched Panambur Beach Volleyball');

    console.log('\n🎉 ALL DISTRICT & CITY SEARCH VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (createdEventIds.length > 0) {
      await prisma.event.deleteMany({ where: { id: { in: createdEventIds } } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifySearch();
