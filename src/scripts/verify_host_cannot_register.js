const axios = require('axios');
const express = require('express');
const http = require('http');
const eventsRouter = require('../routes/events');
const authRouter = require('../routes/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PORT = 5099;
const app = express();
app.use(express.json());
app.use('/api/events', eventsRouter);
app.use('/api/auth', authRouter);

let server;

async function runTest() {
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}`;

  console.log('--- VERIFYING HOST REGISTRATION RESTRICTION ---');

  try {
    // 1. Create Host User
    const hostEmail = `host_${Date.now()}@example.com`;
    const hostSignup = await axios.post(`${baseUrl}/api/auth/signup`, {
      name: 'Event Host User',
      email: hostEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const hostToken = hostSignup.data.token;
    const hostId = hostSignup.data.user.id;

    // 2. Create Attendee User
    const attendeeEmail = `attendee_${Date.now()}@example.com`;
    const attendeeSignup = await axios.post(`${baseUrl}/api/auth/signup`, {
      name: 'Attendee User',
      email: attendeeEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const attendeeToken = attendeeSignup.data.token;
    const attendeeId = attendeeSignup.data.user.id;

    // 3. Create Event by Host
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const eventRes = await axios.post(
      `${baseUrl}/api/events`,
      {
        title: 'Host Restriction Test Event',
        description: 'Testing that event host cannot register for own event.',
        category: 'music',
        location: 'Main Auditorium',
        neighborhood: 'Indiranagar',
        event_datetime: futureDate,
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        total_tickets: 50,
        ticket_price: 0,
      },
      { headers: { Authorization: `Bearer ${hostToken}` } }
    );
    const eventId = eventRes.data.id;

    // 4. Test: Host attempting to RSVP on own event (Should be REJECTED with 403)
    try {
      await axios.post(
        `${baseUrl}/api/events/${eventId}/rsvp`,
        { ticket_quantity: 1 },
        { headers: { Authorization: `Bearer ${hostToken}` } }
      );
      console.error('❌ TEST FAILED: Host was able to register for their own event!');
      process.exit(1);
    } catch (err) {
      if (err.response && err.response.status === 403) {
        console.log('✅ TEST 1 PASSED: Host RSVP request correctly rejected with 403 Forbidden!');
      } else {
        console.error('❌ TEST 1 FAILED: Expected 403 Forbidden, got:', err.response?.status, err.response?.data);
        process.exit(1);
      }
    }

    // 5. Test: Attendee registering for Host\'s event (Should SUCCEED with 200)
    const rsvpRes = await axios.post(
      `${baseUrl}/api/events/${eventId}/rsvp`,
      { ticket_quantity: 1 },
      { headers: { Authorization: `Bearer ${attendeeToken}` } }
    );

    if (rsvpRes.status === 200 && rsvpRes.data.rsvp_count === 1) {
      console.log('✅ TEST 2 PASSED: Non-host attendee successfully registered for event!');
    } else {
      console.error('❌ TEST 2 FAILED: Attendee registration failed:', rsvpRes.data);
      process.exit(1);
    }

    // Clean up
    await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: { in: [hostId, attendeeId] } } });

    console.log('🎉 ALL HOST REGISTRATION RESTRICTION TESTS PASSED 100%!');
  } catch (err) {
    console.error('Unexpected test error:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

runTest();
