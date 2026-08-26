const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');

dotenv.config();

const authRouter = require('../routes/auth');
const healthRouter = require('../routes/health');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5006;
const BASE_URL = `http://localhost:${TEST_PORT}`;

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

async function verifyModule16() {
  console.log('--- VERIFYING MODULE 16: LOCATION FIELDS ON SIGNUP & API ---\n');

  let server;
  let connection;
  let testEmail;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Module 16 Verification] Server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // Test 1: Signup missing location fields -> should return 400
    const res1 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Test Missing Loc',
      email: `test_missing_loc_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      // district & city missing
    });

    if (res1.status === 400) {
      console.log('✅ TEST 1 PASSED: Signup missing location fields rejected with 400 Bad Request');
    } else {
      console.error('❌ TEST 1 FAILED: Expected 400, got:', res1.status, res1.body);
      process.exit(1);
    }

    // Test 2: Signup invalid location combination -> should return 400
    const res2 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Test Invalid Combo',
      email: `test_invalid_combo_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'NonExistentDistrict',
      city: 'NonExistentCity',
    });

    if (res2.status === 400) {
      console.log('✅ TEST 2 PASSED: Signup with invalid location combination rejected with 400 Bad Request');
    } else {
      console.error('❌ TEST 2 FAILED: Expected 400, got:', res2.status, res2.body);
      process.exit(1);
    }

    // Test 3: Valid signup with location fields -> should return 201 and persist fields
    testEmail = `test_loc_user_${Date.now()}@example.com`;
    const res3 = await makeRequest('POST', '/api/auth/signup', {
      name: 'Location Test User',
      email: testEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    if (res3.status === 201 && res3.body.token && res3.body.user) {
      console.log('✅ TEST 3 PASSED: Valid signup created user and returned token');
    } else {
      console.error('❌ TEST 3 FAILED: Valid signup failed:', res3.status, res3.body);
      process.exit(1);
    }

    // Verify DB record
    const dbUrl = process.env.DATABASE_URL;
    const url = new URL(dbUrl);
    connection = await mysql.createConnection({
      host: url.hostname || 'localhost',
      port: url.port ? parseInt(url.port) : 3306,
      user: url.username || 'root',
      password: url.password || 'root',
      database: url.pathname.replace('/', '') || 'event',
    });

    const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', [testEmail]);
    if (rows.length > 0) {
      const userRow = rows[0];
      if (
        userRow.country === 'India' &&
        userRow.state === 'Karnataka' &&
        userRow.district === 'Bengaluru Urban' &&
        userRow.city === 'Bengaluru'
      ) {
        console.log('✅ TEST 4 PASSED: DB record contains correct location fields (India, Karnataka, Bengaluru Urban, Bengaluru)');
      } else {
        console.error('❌ TEST 4 FAILED: Location fields mismatched in DB:', userRow);
        process.exit(1);
      }
    } else {
      console.error('❌ TEST 4 FAILED: User row not found in database');
      process.exit(1);
    }

    // Test 5: Login with email & password -> should work cleanly without location fields
    const res5 = await makeRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: 'Password123!',
    });

    if (res5.status === 200 && res5.body.token && res5.body.user) {
      console.log('✅ TEST 5 PASSED: Existing login flow works cleanly without location fields');
    } else {
      console.error('❌ TEST 5 FAILED: Login failed:', res5.status, res5.body);
      process.exit(1);
    }

    console.log('\n🎉 ALL MODULE 16 VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    if (server) server.close();
    if (connection && testEmail) {
      await connection.query('DELETE FROM users WHERE email = ?', [testEmail]).catch(() => {});
      await connection.end().catch(() => {});
    }
  }
}

verifyModule16().catch((err) => {
  console.error('Module 16 verification error:', err);
  process.exit(1);
});
