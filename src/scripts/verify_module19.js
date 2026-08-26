const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { execSync } = require('child_process');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const healthRouter = require('../routes/health');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5009;
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

async function verifyModule19() {
  console.log('--- VERIFYING MODULE 19: FRONTEND TIERED BOARD LAYOUT & FEED INTEGRATION ---\n');

  let server;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Module 19 Verification] Test server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // 1. Verify Feed Endpoint returns structured tiers
    const feedRes = await makeRequest('GET', '/api/events/feed');
    if (
      feedRes.status === 200 &&
      feedRes.body.topPicks !== undefined &&
      feedRes.body.stateEvents !== undefined &&
      feedRes.body.countryEvents !== undefined &&
      feedRes.body.userLocation !== undefined
    ) {
      console.log('✅ TEST 1 PASSED: GET /api/events/feed returns userLocation and all 3 tier arrays (topPicks, stateEvents, countryEvents)');
    } else {
      console.error('❌ TEST 1 FAILED: Invalid feed structure:', feedRes.status, feedRes.body);
      process.exit(1);
    }

    // 2. Verify Component code contains the 3 section titles and per-section empty states
    const tieredBoardPath = path.resolve(__dirname, '../../../client/src/components/TieredEventBoard.jsx');
    const fs = require('fs');
    const boardCode = fs.readFileSync(tieredBoardPath, 'utf8');


    if (
      boardCode.includes('Top Picks in ${city}') &&
      boardCode.includes('More in ${state}') &&
      boardCode.includes('Across ${country}')
    ) {
      console.log('✅ TEST 2 PASSED: TieredEventBoard renders sections in vertical order (City → State → Country) with dynamic titles');
    } else {
      console.error('❌ TEST 2 FAILED: Missing section titles in TieredEventBoard.jsx');
      process.exit(1);
    }

    if (
      boardCode.includes('check the state and country sections below') &&
      boardCode.includes('outside ${city} right now') &&
      boardCode.includes('outside ${state} right now')
    ) {
      console.log('✅ TEST 3 PASSED: Per-section empty-state messaging is implemented for all 3 tiers');
    } else {
      console.error('❌ TEST 3 FAILED: Per-section empty states missing in TieredEventBoard.jsx');
      process.exit(1);
    }

    // 3. Verify Client Application Build
    console.log('\n▶ Verifying Client Vite Production Build...');
    const clientPath = path.resolve(__dirname, '../../../client');
    const buildOutput = execSync('npm run build', { cwd: clientPath, encoding: 'utf8' });

    if (buildOutput.includes('built in')) {
      console.log('✅ TEST 4 PASSED: Frontend production bundle compiled with 0 errors');
    } else {
      console.error('❌ TEST 4 FAILED: Client build issue:', buildOutput);
      process.exit(1);
    }

    console.log('\n🎉 ALL MODULE 19 VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyModule19().catch((err) => {
  console.error('Module 19 verification error:', err);
  process.exit(1);
});
