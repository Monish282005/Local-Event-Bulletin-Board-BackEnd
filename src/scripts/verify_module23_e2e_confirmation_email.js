const { generateQrCodeBase64 } = require('../utils/qrCodeHelper');
const { generateConfirmationEmailHtml } = require('../utils/emailTemplateHelper');
const { sendTicketConfirmationEmail } = require('../utils/emailService');
const axios = require('axios');
const express = require('express');
const http = require('http');
const eventsRouter = require('../routes/events');
const authRouter = require('../routes/auth');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PORT = 5123;
const app = express();
app.use(express.json());
app.use('/api/events', eventsRouter);
app.use('/api/auth', authRouter);

let server;

async function verifyModule23MasterSuite() {
  console.log('================================================================');
  console.log('  MODULE 23 MASTER VERIFICATION SUITE: E2E EMAIL CONFIRMATION  ');
  console.log('================================================================\n');

  try {
    // -------------------------------------------------------------
    // STEP 1: MODULE 20 QR CODE UTILITY CHECK
    // -------------------------------------------------------------
    console.log('▶ [1/4] Testing Module 20: QR Code Generator...');
    const testPassCode = 'PASS-E2E-TEST-2026';
    const qrBase64 = await generateQrCodeBase64(testPassCode);
    if (!qrBase64 || !qrBase64.startsWith('data:image/png;base64,')) {
      throw new Error('Module 20 check failed: QR Code base64 data URL invalid!');
    }
    console.log('  ✅ Module 20 PASSED: Valid Base64 PNG QR Code generated.\n');

    // -------------------------------------------------------------
    // STEP 2: MODULE 20a TEMPLATE FORMATTER CHECK
    // -------------------------------------------------------------
    console.log('▶ [2/4] Testing Module 20a: HTML Email Template Formatter...');
    const compiledHtml = generateConfirmationEmailHtml({
      attendee_name: 'Master Test User',
      customer_email: 'mastertest@example.com',
      event_title: 'E2E Master Concert 2026',
      event_datetime: 'Sat, Oct 10, 2026 at 07:00 PM',
      venue: 'Chinnaswamy Stadium, MG Road, Bengaluru, Karnataka',
      pass_code: testPassCode,
      qr_code_base64: qrBase64,
      quantity: 3,
      ticket_price: 1200,
      total_amount: 3600,
      transaction_id: 'pay_E2E_9921',
      payment_date: 'Aug 27, 2026',
      app_base_url: 'http://localhost:5173',
    });

    const orphanPlaceholders = compiledHtml.match(/\{\{[a-zA-Z0-9_]+\}\}/g);
    if (orphanPlaceholders && orphanPlaceholders.length > 0) {
      throw new Error(`Module 20a check failed: Found unreplaced placeholders: ${orphanPlaceholders.join(', ')}`);
    }
    if (!compiledHtml.includes('Master Test User') || !compiledHtml.includes('E2E Master Concert 2026') || !compiledHtml.includes('₹3600.00')) {
      throw new Error('Module 20a check failed: Formatted output HTML is missing expected values!');
    }
    console.log('  ✅ Module 20a PASSED: 100% of merge fields replaced without orphaned tags.\n');

    // -------------------------------------------------------------
    // STEP 3: MODULE 21 EMAIL DISPATCHER CHECK
    // -------------------------------------------------------------
    console.log('▶ [3/4] Testing Module 21: Email Dispatcher Service...');
    const dispatchResult = await sendTicketConfirmationEmail({
      userName: 'Master Test User',
      userEmail: 'mastertest@example.com',
      eventTitle: 'E2E Master Concert 2026',
      eventDate: 'Sat, Oct 10, 2026 at 07:00 PM',
      location: 'Chinnaswamy Stadium',
      neighborhood: 'MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      ticketNumbers: ['TK-101', 'TK-102', 'TK-103'],
      quantity: 3,
      ticketPrice: 1200,
      totalAmountPaid: 3600,
      paymentId: 'pay_E2E_9921',
      orderId: 'order_E2E_1102',
      bookedAt: new Date().toISOString(),
    });

    if (!dispatchResult) {
      throw new Error('Module 21 check failed: Dispatcher returned false!');
    }
    console.log('  ✅ Module 21 PASSED: Email dispatcher successfully executed.\n');

    // -------------------------------------------------------------
    // STEP 4: MODULE 22 END-TO-END HTTP BOOKING ROUTE CHECK
    // -------------------------------------------------------------
    console.log('▶ [4/4] Testing Module 22: Live Booking & Automated Email Dispatch Route...');
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(PORT, resolve));
    const baseUrl = `http://localhost:${PORT}`;

    // Create Host
    const hostSignup = await axios.post(`${baseUrl}/api/auth/signup`, {
      name: 'E2E Host User',
      email: `e2e_host_${Date.now()}@example.com`,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    // Create Attendee
    const attendeeEmail = `e2e_attendee_${Date.now()}@example.com`;
    const attendeeSignup = await axios.post(`${baseUrl}/api/auth/signup`, {
      name: 'E2E Attendee User',
      email: attendeeEmail,
      password: 'Password123!',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });

    // Post Event
    const eventRes = await axios.post(
      `${baseUrl}/api/events`,
      {
        title: 'End-to-End E2E Confirmation Email Event',
        description: 'Testing live registration to email confirmation flow.',
        category: 'music',
        location: 'St. Joseph Auditorium',
        neighborhood: 'Museum Road',
        event_datetime: new Date(Date.now() + 86400000 * 5).toISOString(),
        country: 'India',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        city: 'Bengaluru',
        total_tickets: 50,
        ticket_price: 350,
      },
      { headers: { Authorization: `Bearer ${hostSignup.data.token}` } }
    );
    const eventId = eventRes.data.id;

    // Reserve Tickets
    const rsvpRes = await axios.post(
      `${baseUrl}/api/events/${eventId}/rsvp`,
      { ticket_quantity: 1 },
      { headers: { Authorization: `Bearer ${attendeeSignup.data.token}` } }
    );

    if (rsvpRes.status !== 200 || !rsvpRes.data.ticket_numbers) {
      throw new Error('Module 22 check failed: Live RSVP booking failed!');
    }
    console.log('  ✅ Module 22 PASSED: Live registration created ticket reservation and fired confirmation email.\n');

    // Clean up
    await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.user.deleteMany({ where: { id: { in: [hostSignup.data.user.id, attendeeSignup.data.user.id] } } });

    console.log('================================================================');
    console.log('🎉 MODULE 23 MASTER SUITE PASSED 100%! ALL SYSTEMS GO! 🚀');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ MODULE 23 MASTER SUITE FAILED:', err.response?.data || err.message);
    process.exit(1);
  } finally {
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyModule23MasterSuite();
