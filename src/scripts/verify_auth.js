const http = require('http');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
dotenv.config();

const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;
const BASE_URL = `http://localhost:${PORT}`;

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
          let parsed;
          try {
            parsed = JSON.parse(responseBody);
          } catch (e) {
            parsed = responseBody;
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

async function verifyModule2() {
  console.log('--- Starting Module 2 Auth API Verification ---');
  
  // Clean up any existing test user
  const testEmail = `testuser_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  try {
    // 1. Test Weak Password Signup (< 8 chars)
    console.log('Testing weak password rejection...');
    const weakRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Test User',
      email: testEmail,
      password: '123',
    });
    if (weakRes.status !== 400) {
      throw new Error(`Expected 400 for weak password, got ${weakRes.status}`);
    }
    console.log('✅ Criteria 2 Passed: Weak password (< 8 chars) rejected with 400 Bad Request.');

    // 2. Test Valid Signup
    console.log('Testing valid user signup...');
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Test User',
      email: testEmail,
      password: testPassword,
    });
    if (signupRes.status !== 201) {
      throw new Error(`Expected 201 for signup, got ${signupRes.status}: ${JSON.stringify(signupRes.body)}`);
    }
    if (!signupRes.body.token) {
      throw new Error('Signup response missing token!');
    }
    if (signupRes.body.user.password || signupRes.body.user.password_hash) {
      throw new Error('Password or password_hash leaked in signup response!');
    }
    console.log('✅ Valid signup succeeded, returned user (without password_hash) and token.');

    // 3. Test Duplicate Email Signup
    console.log('Testing duplicate email rejection...');
    const dupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Duplicate User',
      email: testEmail,
      password: testPassword,
    });
    if (dupRes.status !== 409) {
      throw new Error(`Expected 409 Conflict for duplicate email, got ${dupRes.status}`);
    }
    console.log('✅ Criteria 1 Passed: Duplicate email signup rejected with 409 Conflict.');

    // 4. Test Login with Invalid Email
    console.log('Testing login with invalid email...');
    const invalidEmailRes = await makeRequest('POST', '/api/auth/login', {
      email: 'nonexistent@example.com',
      password: testPassword,
    });
    if (invalidEmailRes.status !== 401 || invalidEmailRes.body.error !== 'Invalid email or password.') {
      throw new Error(`Expected 401 with generic error for invalid email, got status ${invalidEmailRes.status}`);
    }
    console.log('✅ Generic error returned for non-existent email login.');

    // 5. Test Login with Incorrect Password
    console.log('Testing login with incorrect password...');
    const wrongPassRes = await makeRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: 'wrongPassword123',
    });
    if (wrongPassRes.status !== 401 || wrongPassRes.body.error !== 'Invalid email or password.') {
      throw new Error(`Expected 401 with generic error for wrong password, got status ${wrongPassRes.status}`);
    }
    console.log('✅ Generic error returned for wrong password login.');

    // 6. Test Valid Login
    console.log('Testing valid login...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: testEmail,
      password: testPassword,
    });
    if (loginRes.status !== 200 || !loginRes.body.token) {
      throw new Error(`Valid login failed, got status ${loginRes.status}`);
    }
    if (loginRes.body.user.password || loginRes.body.user.password_hash) {
      throw new Error('Password or password_hash leaked in login response!');
    }
    const token = loginRes.body.token;
    console.log('✅ Criteria 3 & 4 Passed: Login returns valid JWT and password is never exposed in response.');

    // 7. Test Protected Route with Valid Token
    console.log('Testing protected route (/api/auth/me) with valid token...');
    const meRes = await makeRequest('GET', '/api/auth/me', null, {
      Authorization: `Bearer ${token}`,
    });
    if (meRes.status !== 200 || meRes.body.user.email !== testEmail.toLowerCase()) {
      throw new Error(`Protected route failed with valid token, status: ${meRes.status}`);
    }
    if (meRes.body.user.password || meRes.body.user.password_hash) {
      throw new Error('Password or password_hash leaked in protected route response!');
    }
    console.log('✅ Protected route accepts valid JWT token.');

    // 8. Test Protected Route with Missing Token
    console.log('Testing protected route with missing token...');
    const noTokenRes = await makeRequest('GET', '/api/auth/me');
    if (noTokenRes.status !== 401) {
      throw new Error(`Expected 401 for missing token, got ${noTokenRes.status}`);
    }

    // 9. Test Protected Route with Invalid Token
    console.log('Testing protected route with invalid token...');
    const invalidTokenRes = await makeRequest('GET', '/api/auth/me', null, {
      Authorization: 'Bearer invalid.jwt.token.string',
    });
    if (invalidTokenRes.status !== 401) {
      throw new Error(`Expected 401 for invalid token, got ${invalidTokenRes.status}`);
    }
    console.log('✅ Criteria 5 Passed: Protected routes reject requests with no token or invalid token.');

    console.log('\n--- ALL MODULE 2 ACCEPTANCE CRITERIA PASSED SUCCESSFULLY ---');

    // Clean up test user
    await prisma.user.deleteMany({
      where: { email: testEmail.toLowerCase() },
    });
  } catch (error) {
    console.error('Verification failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyModule2();
