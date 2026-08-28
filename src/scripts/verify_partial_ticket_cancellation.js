const http = require('http');
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
        port: 5046,
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
  server.listen(5046, async () => {
    console.log('--- VERIFYING PARTIAL TICKET CANCELLATION & DATABASE STATE ---');
    try {
      // 1. Signup Host User
      const hostRes = await makeRequest('POST', '/api/auth/signup', {
        name: 'Host User',
        email: `host_${Date.now()}@example.com`,
        password: 'Password123!',
        country: 'India',
        state: 'Tamil Nadu',
        district: 'Coimbatore',
        city: 'Coimbatore',
      });
      const hostToken = hostRes.body.token;

      // 2. Signup Attendee User
      const attendeeRes = await makeRequest('POST', '/api/auth/signup', {
        name: 'Attendee User',
        email: `attendee_${Date.now()}@example.com`,
        password: 'Password123!',
        country: 'India',
        state: 'Tamil Nadu',
        district: 'Coimbatore',
        city: 'Coimbatore',
      });
      const attendeeToken = attendeeRes.body.token;
      const attendeeId = attendeeRes.body.user.id;

      // 3. Host creates Event with 20 total tickets
      const eventRes = await makeRequest('POST', '/api/events', {
        title: 'Partial Cancellation Concert ' + Date.now(),
        description: 'Test event for partial ticket cancellation',
        category: 'music',
        location: 'VOC Park Grounds',
        neighborhood: 'Coimbatore',
        country: 'India',
        state: 'Tamil Nadu',
        district: 'Coimbatore',
        city: 'Coimbatore',
        event_datetime: new Date(Date.now() + 86400000).toISOString(),
        total_tickets: 20,
        allow_cancellation: true,
      }, { Authorization: `Bearer ${hostToken}` });

      const eventId = eventRes.body.id;

      // 4. Attendee books 5 Tickets
      const bookingRes = await makeRequest('POST', `/api/events/${eventId}/rsvp`, {
        quantity: 5,
      }, { Authorization: `Bearer ${attendeeToken}` });

      console.log(`✅ Attendee reserved 5 tickets. Total Event rsvp_count: ${bookingRes.body.rsvp_count}`);

      // Verify DB initial state: 5 active registrations
      const activeRegsBefore = await prisma.eventRegistration.count({
        where: { event_id: eventId, user_id: attendeeId, deleted_at: null },
      });
      if (activeRegsBefore !== 5) {
        console.error(`❌ Expected 5 active registrations in DB, got: ${activeRegsBefore}`);
        process.exit(1);
      }

      // 5. Perform Partial Cancellation: Cancel 2 Tickets
      const cancelRes = await makeRequest('DELETE', `/api/events/${eventId}/rsvp`, {
        quantity: 2,
      }, { Authorization: `Bearer ${attendeeToken}` });

      console.log('✅ Partial Cancellation API Response:', cancelRes.body.message);
      console.log(`   Canceled tickets: ${cancelRes.body.canceled_tickets_count}, Remaining user tickets: ${cancelRes.body.remaining_user_tickets}`);

      if (cancelRes.body.canceled_tickets_count !== 2 || cancelRes.body.remaining_user_tickets !== 3) {
        console.error('❌ Partial cancellation API response mismatch');
        process.exit(1);
      }

      // 6. Verify Database State after Partial Cancellation
      const activeRegsAfter = await prisma.eventRegistration.count({
        where: { event_id: eventId, user_id: attendeeId, deleted_at: null },
      });
      const softDeletedRegs = await prisma.eventRegistration.count({
        where: { event_id: eventId, user_id: attendeeId, NOT: { deleted_at: null } },
      });

      const updatedEventDb = await prisma.event.findUnique({
        where: { id: eventId },
      });

      console.log(`✅ DB State Verification:`);
      console.log(`   Active Registrations remaining: ${activeRegsAfter} (Expected: 3)`);
      console.log(`   Soft-deleted Registrations: ${softDeletedRegs} (Expected: 2)`);
      console.log(`   Event DB rsvp_count: ${updatedEventDb.rsvp_count} (Expected: 3)`);

      if (activeRegsAfter === 3 && softDeletedRegs === 2 && updatedEventDb.rsvp_count === 3) {
        console.log('\n🎉 PARTIAL TICKET CANCELLATION DATABASE & API VERIFICATION PASSED 100%!');
        server.close();
        process.exit(0);
      } else {
        console.error('❌ Database verification failed.');
        server.close();
        process.exit(1);
      }
    } catch (err) {
      console.error('Error during test:', err);
      server.close();
      process.exit(1);
    }
  });
}

runVerification();
