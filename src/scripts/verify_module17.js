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
const TEST_PORT = 5007;
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

async function verifyModule17() {
  console.log('--- VERIFYING MODULE 17: LOCATION FIELDS ON POST EVENT FORM & API ---\n');

  let server;
  let connection;
  let userId;
  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Module 17 Verification] Server running on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    // Signup user to get token
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Event Creator',
      email: `event_creator_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    const token = signupRes.body.token;
    userId = signupRes.body.user.id;

    // Test 1: Creating event without location fields -> 400 Bad Request
    const res1 = await makeRequest(
      'POST',
      '/api/events',
      {
        title: 'Missing Location Event',
        description: 'Test Description',
        category: 'music',
        location: 'Park Street',
        neighborhood: 'Indiranagar',
        event_datetime: new Date(Date.now() + 86400000).toISOString(),
        // country, state, district, city missing
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res1.status === 400) {
      console.log('✅ TEST 1 PASSED: POST /api/events missing location fields rejected with 400 Bad Request');
    } else {
      console.error('❌ TEST 1 FAILED: Expected 400, got:', res1.status, res1.body);
      process.exit(1);
    }

    // Test 2: Creating event with invalid location combination -> 400 Bad Request
    const res2 = await makeRequest(
      'POST',
      '/api/events',
      {
        title: 'Invalid Combo Event',
        description: 'Test Description',
        category: 'music',
        location: 'Park Street',
        neighborhood: 'Indiranagar',
        country: 'India',
        state: 'Karnataka',
        district: 'NonExistentDistrict',
        city: 'NonExistentCity',
        event_datetime: new Date(Date.now() + 86400000).toISOString(),
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res2.status === 400) {
      console.log('✅ TEST 2 PASSED: POST /api/events with invalid location combination rejected with 400 Bad Request');
    } else {
      console.error('❌ TEST 2 FAILED: Expected 400, got:', res2.status, res2.body);
      process.exit(1);
    }

    // Test 3: Past date validation still enforced alongside location fields -> 400 Bad Request
    const res3 = await makeRequest(
      'POST',
      '/api/events',
      {
        title: 'Past Date Event',
        description: 'Test Description',
        category: 'music',
        location: 'Park Street',
        neighborhood: 'Indiranagar',
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        event_datetime: new Date(Date.now() - 3600000).toISOString(),
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res3.status === 400) {
      console.log('✅ TEST 3 PASSED: Past event date validation still enforced (400 Bad Request)');
    } else {
      console.error('❌ TEST 3 FAILED: Expected 400 for past date, got:', res3.status, res3.body);
      process.exit(1);
    }

    // Test 4: Valid event creation with structured location fields -> 201 Created
    const res4 = await makeRequest(
      'POST',
      '/api/events',
      {
        title: 'Valid Location Event',
        description: 'Test Description',
        category: 'music',
        location: 'MG Road Pavilion',
        neighborhood: 'Indiranagar',
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        event_datetime: new Date(Date.now() + 86400000).toISOString(),
      },
      { Authorization: `Bearer ${token}` }
    );

    if (res4.status === 201 && res4.body.id) {
      console.log('✅ TEST 4 PASSED: Valid event created successfully with 201 Created');
    } else {
      console.error('❌ TEST 4 FAILED: Valid event creation failed:', res4.status, res4.body);
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

    const [rows] = await connection.query('SELECT * FROM events WHERE id = ?', [res4.body.id]);
    if (rows.length > 0) {
      const evRow = rows[0];
      if (
        evRow.country === 'India' &&
        evRow.state === 'Karnataka' &&
        evRow.district === 'Bengaluru Urban' &&
        evRow.city === 'Bengaluru'
      ) {
        console.log('✅ TEST 5 PASSED: Event DB record contains correct structured location fields');
      } else {
        console.error('❌ TEST 5 FAILED: Event location fields mismatched in DB:', evRow);
        process.exit(1);
      }
    } else {
      console.error('❌ TEST 5 FAILED: Created event row not found in database');
      process.exit(1);
    }

    console.log('\n🎉 ALL MODULE 17 VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    if (server) server.close();
    if (connection && userId) {
      await connection.query('DELETE FROM events WHERE created_by = ?', [userId]).catch(() => {});
      await connection.query('DELETE FROM users WHERE id = ?', [userId]).catch(() => {});
      await connection.end().catch(() => {});
    }
  }
}

verifyModule17().catch((err) => {
  console.error('Module 17 verification error:', err);
  process.exit(1);
});
