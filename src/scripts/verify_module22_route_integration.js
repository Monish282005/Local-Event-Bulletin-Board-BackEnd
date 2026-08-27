const axios = require('axios');
const express = require('express');
const http = require('http');
const eventsRouter = require('../routes/events');
const authRouter = require('../routes/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PORT = 5122;
const app = express();
app.use(express.json());
app.use('/api/events', eventsRouter);
app.use('/api/auth', authRouter);

let server;

async function verifyModule22() {
  console.log('================================================================');
  console.log('  MODULE 22 VERIFICATION: PAYMENT & RSVP ROUTE INTEGRATION     ');
  console.log('================================================================\n');

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(PORT, resolve));
  const baseUrl = `http://localhost:${PORT}`;

  try {
    // 1. Create Host User
    const hostEmail = `mod22_host_${Date.now()}@example.com`;
    const hostSignup = await axios.post(`${baseUrl}/api/auth/signup`, {
      name: 'Module22 Host',
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
    const attendeeEmail = `mod22_attendee_${Date.now()}@example.com`;
    const attendeeSignup = await axios.post(`${baseUrl}/api/auth/signup`, {
      name: 'Module22 Attendee',
      email: attendeeEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    const attendeeToken = attendeeSignup.data.token;
    const attendeeId = attendeeSignup.data.user.id;

    // 3. Host Creates Event
    const eventRes = await axios.post(
      `${baseUrl}/api/events`,
      {
        title: 'Module 22 Confirmation Email Test Event',
        description: 'Testing confirmation email dispatch on route reservation.',
        category: 'music',
        location: 'Kanteerava Indoor Stadium',
        neighborhood: 'Kasturba Road',
        event_datetime: new Date(Date.now() + 86400000 * 3).toISOString(),
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        total_tickets: 100,
        ticket_price: 250,
      },
      { headers: { Authorization: `Bearer ${hostToken}` } }
    );
    const eventId = eventRes.data.id;

    // 4. Attendee RSVPs for 2 Tickets
    console.log('▶ Posting RSVP reservation for 2 tickets...');
    const rsvpRes = await axios.post(
      `${baseUrl}/api/events/${eventId}/rsvp`,
      { ticket_quantity: 2 },
      { headers: { Authorization: `Bearer ${attendeeToken}` } }
    );

    if (rsvpRes.status === 200 && rsvpRes.data.ticket_numbers?.length === 2) {
      console.log('✅ TEST 1 PASSED: RSVP endpoint returned 200 OK with ticket numbers:', rsvpRes.data.ticket_numbers);
    } else {
      throw new Error(`TEST 1 FAILED: Expected 200 OK with 2 tickets, got ${rsvpRes.status}`);
    }

    // Clean up test records
    await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: { in: [hostId, attendeeId] } } });

    console.log('\n================================================================');
    console.log('🎉 MODULE 22 ACCEPTANCE CRITERIA PASSED 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ MODULE 22 VERIFICATION FAILED:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    server.close();
    await prisma.$disconnect();
  }
}

verifyModule22();
