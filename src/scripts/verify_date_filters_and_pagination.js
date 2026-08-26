const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5027;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

function makeRequest(method, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const req = http.request(url, { method, headers }, (res) => {
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

async function verifyDateFiltersAndPagination() {
  console.log('--- VERIFYING DATE FILTRATION, SORTING & PAGINATION ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Date Filters & Pagination Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Test Date Preset 'today'
    const todayRes = await makeRequest('GET', '/api/events?datePreset=today&paginate=true');
    if (todayRes.status !== 200 || !todayRes.body.pagination) {
      console.error('❌ TEST 1 FAILED: Date preset today failed:', todayRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 1 PASSED: Date preset "today" filter executed successfully');

    // 2. Test Date Preset 'this_week'
    const weekRes = await makeRequest('GET', '/api/events?datePreset=this_week&paginate=true');
    if (weekRes.status !== 200 || !weekRes.body.pagination) {
      console.error('❌ TEST 2 FAILED: Date preset this_week failed:', weekRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Date preset "this_week" filter executed successfully');

    // 3. Test Custom Date Range (startDate & endDate)
    const startDateStr = new Date().toISOString().split('T')[0];
    const endDateStr = new Date(Date.now() + 86400000 * 30).toISOString().split('T')[0];
    const customRes = await makeRequest('GET', `/api/events?datePreset=custom&startDate=${startDateStr}&endDate=${endDateStr}&paginate=true`);
    if (customRes.status !== 200 || !customRes.body.pagination) {
      console.error('❌ TEST 3 FAILED: Custom date range filter failed:', customRes.body);
      process.exit(1);
    }
    console.log(`✅ TEST 3 PASSED: Custom date range (${startDateStr} to ${endDateStr}) filter executed successfully`);

    // 4. Test Sorting (sort=popularity_desc)
    const sortRes = await makeRequest('GET', '/api/events?sort=popularity_desc&paginate=true');
    if (sortRes.status !== 200 || !sortRes.body.events) {
      console.error('❌ TEST 4 FAILED: Sorting failed:', sortRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: Sorting (popularity_desc) executed successfully');

    // 5. Test Pagination Parameters & Feed Filtering
    const feedRes = await makeRequest('GET', '/api/events/feed?city=Bengaluru&datePreset=this_week&sort=datetime_asc');
    if (feedRes.status !== 200 || !feedRes.body.pagination) {
      console.error('❌ TEST 5 FAILED: Hierarchical feed with date filter failed:', feedRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 5 PASSED: Hierarchical feed with date filtration & pagination metadata returned successfully');

    console.log('\n🎉 ALL DATE FILTRATION, SORTING & PAGINATION VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyDateFiltersAndPagination();
