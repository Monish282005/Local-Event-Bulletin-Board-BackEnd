const http = require('http');
const express = require('express');
const eventsRouter = require('../routes/events');
const authRouter = require('../routes/auth');

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

const server = http.createServer(app);

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : '';
    const req = http.request(
      {
        hostname: 'localhost',
        port: 5045,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(bodyStr);
    req.end();
  });
}

async function runVerification() {
  server.listen(5045, async () => {
    console.log('--- VERIFYING DEFAULT CATEGORY IMAGE ASSIGNMENT ---');
    try {
      // 1. Signup user
      const userRes = await makeRequest('POST', '/api/auth/signup', {
        name: 'Category Image Tester',
        email: `img_tester_${Date.now()}@example.com`,
        password: 'Password123!',
        country: 'India',
        state: 'Tamil Nadu',
        district: 'Coimbatore',
        city: 'Coimbatore',
      });
      const token = userRes.body.token;

      // 2. Create Event without image_url for Sports
      const sportsRes = await makeRequest('POST', '/api/events', {
        title: 'Default Sports Event ' + Date.now(),
        description: 'Sports event without uploaded image',
        category: 'sports',
        location: 'Race Course',
        neighborhood: 'Coimbatore',
        country: 'India',
        state: 'Tamil Nadu',
        district: 'Coimbatore',
        city: 'Coimbatore',
        event_datetime: new Date(Date.now() + 86400000).toISOString(),
        total_tickets: 50,
      }, { Authorization: `Bearer ${token}` });

      const expectedSportsUrl = 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787907059/Sport.jpg';
      if (sportsRes.body.image_url === expectedSportsUrl) {
        console.log('✅ Sports default image assigned correctly:', sportsRes.body.image_url);
      } else {
        console.error('❌ Sports default image failed. Got:', sportsRes.body.image_url);
        process.exit(1);
      }

      // 3. Create Event without image_url for Music
      const musicRes = await makeRequest('POST', '/api/events', {
        title: 'Default Music Event ' + Date.now(),
        description: 'Music event without uploaded image',
        category: 'music',
        location: 'Prozone',
        neighborhood: 'Coimbatore',
        country: 'India',
        state: 'Tamil Nadu',
        district: 'Coimbatore',
        city: 'Coimbatore',
        event_datetime: new Date(Date.now() + 86400000).toISOString(),
        total_tickets: 100,
      }, { Authorization: `Bearer ${token}` });

      const expectedMusicUrl = 'https://res.cloudinary.com/evrmjfy2/image/upload/v1787906417/Music.jpg';
      if (musicRes.body.image_url === expectedMusicUrl) {
        console.log('✅ Music default image assigned correctly:', musicRes.body.image_url);
      } else {
        console.error('❌ Music default image failed. Got:', musicRes.body.image_url);
        process.exit(1);
      }

      console.log('\n🎉 ALL DEFAULT CATEGORY IMAGE ASSIGNMENT VERIFICATIONS PASSED 100%!');
      server.close();
      process.exit(0);
    } catch (err) {
      console.error('Error during test:', err);
      server.close();
      process.exit(1);
    }
  });
}

runVerification();
