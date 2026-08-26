const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5010;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/api/events', eventsRouter);

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const req = http.request(url, { method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

async function runPaginationVerification() {
  console.log('--- VERIFYING BACKEND PAGINATION ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Pagination Verification] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Verify GET /api/events?page=1&limit=3
    const page1Res = await makeRequest('/api/events?page=1&limit=3');
    if (page1Res.status !== 200 || !page1Res.body.pagination) {
      console.error('❌ TEST 1 FAILED: GET /api/events?page=1&limit=3 response format invalid:', page1Res.body);
      process.exit(1);
    }

    const { events: p1Events, pagination: p1Meta } = page1Res.body;
    console.log(`✅ TEST 1 PASSED: Flat pagination Page 1 returned ${p1Events.length} items. Meta: total=${p1Meta.total}, totalPages=${p1Meta.totalPages}`);

    // 2. Verify GET /api/events?page=2&limit=3
    const page2Res = await makeRequest('/api/events?page=2&limit=3');
    if (page2Res.status !== 200 || !page2Res.body.pagination) {
      console.error('❌ TEST 2 FAILED: GET /api/events?page=2&limit=3 failed:', page2Res.body);
      process.exit(1);
    }

    const { events: p2Events, pagination: p2Meta } = page2Res.body;
    console.log(`✅ TEST 2 PASSED: Flat pagination Page 2 returned ${p2Events.length} items. Page=${p2Meta.page}, hasPrevPage=${p2Meta.hasPrevPage}`);

    // 3. Verify GET /api/events/feed?limit=3&topPicksPage=1&statePage=1&countryPage=1
    const feedRes = await makeRequest('/api/events/feed?limit=3&topPicksPage=1');
    if (feedRes.status !== 200 || !feedRes.body.pagination) {
      console.error('❌ TEST 3 FAILED: GET /api/events/feed pagination format invalid:', feedRes.body);
      process.exit(1);
    }

    const { topPicks, stateEvents, countryEvents, pagination: feedMeta } = feedRes.body;
    if (!feedMeta.topPicks || !feedMeta.stateEvents || !feedMeta.countryEvents) {
      console.error('❌ TEST 3 FAILED: Feed metadata missing tier information');
      process.exit(1);
    }

    console.log(`✅ TEST 3 PASSED: Feed pagination returned TopPicks=${topPicks.length} (total=${feedMeta.topPicks.total}), StateEvents=${stateEvents.length} (total=${feedMeta.stateEvents.total}), CountryEvents=${countryEvents.length} (total=${feedMeta.countryEvents.total})`);

    console.log('\n🎉 ALL PAGINATION VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ PAGINATION VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

runPaginationVerification();
