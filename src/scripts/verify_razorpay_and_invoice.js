const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

dotenv.config();

const authRouter = require('../routes/auth');
const eventsRouter = require('../routes/events');

const app = express();
const TEST_PORT = 5034;
const BASE_URL = `http://localhost:${TEST_PORT}`;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(BASE_URL + path);
    const bodyStr = data ? JSON.stringify(data) : '';
    const reqHeaders = { 'Content-Type': 'application/json', ...headers };
    if (data) reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
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
    if (data) req.write(bodyStr);
    req.end();
  });
}

async function verifyRazorpayAndInvoice() {
  console.log('--- VERIFYING RAZORPAY PAYMENT GATEWAY & INVOICE GENERATION ---\n');

  let server;
  let userId, userToken, eventId;

  await new Promise((resolve) => {
    server = app.listen(TEST_PORT, () => {
      console.log(`[Razorpay & Invoice Test] Server listening on port ${TEST_PORT}\n`);
      resolve();
    });
  });

  try {
    const testEmail = `razorpay_tester_${Date.now()}@example.com`;

    // 1. Create User
    const signupRes = await makeRequest('POST', '/api/auth/signup', {
      name: 'Razorpay Customer',
      email: testEmail,
      password: 'Password123!',
      phone: '+91 9876543210',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
    });
    userId = signupRes.body.user.id;
    userToken = signupRes.body.token;

    // 2. Create Paid Event (₹499 per ticket)
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const createEventRes = await makeRequest('POST', '/api/events', {
      title: 'Premium Tech Conference',
      description: 'Annual Technology & AI Summit.',
      category: 'other',
      location: 'ITC Gardenia',
      neighborhood: 'Indiranagar',
      country: 'India',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      city: 'Bengaluru',
      event_datetime: futureDate,
      total_tickets: 100,
      ticket_price: 499,
    }, { Authorization: `Bearer ${userToken}` });

    if (createEventRes.status !== 201 || !createEventRes.body.id) {
      console.error('❌ TEST 1 FAILED: Could not create paid event:', createEventRes.body);
      process.exit(1);
    }
    eventId = createEventRes.body.id;
    console.log('✅ TEST 1 PASSED: Created paid event with ticket_price = ₹499');

    // 3. Test POST /api/events/:id/create-razorpay-order
    const orderRes = await makeRequest('POST', `/api/events/${eventId}/create-razorpay-order`, {
      ticket_quantity: 2,
    }, { Authorization: `Bearer ${userToken}` });

    if (orderRes.status !== 200 || !orderRes.body.order_id) {
      console.error('❌ TEST 2 FAILED: Razorpay order creation failed:', orderRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 2 PASSED: Created Razorpay Order ID:', orderRes.body.order_id);
    console.log(`   Amount: ₹${orderRes.body.total_amount} (${orderRes.body.amount} paise)`);

    // 4. Generate valid HMAC signature for verification
    const orderId = orderRes.body.order_id;
    const mockPaymentId = `pay_mock_${Date.now()}`;
    const secret = process.env.RAZORPAY_KEY_SECRET || 'M8Er3GWPex31P60lhHzYRJq1';
    const mockSignature = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${mockPaymentId}`)
      .digest('hex');

    // 5. Test POST /api/events/:id/verify-razorpay-payment
    const verifyRes = await makeRequest('POST', `/api/events/${eventId}/verify-razorpay-payment`, {
      razorpay_order_id: orderId,
      razorpay_payment_id: mockPaymentId,
      razorpay_signature: mockSignature,
      ticket_quantity: 2,
    }, { Authorization: `Bearer ${userToken}` });

    if (verifyRes.status !== 200 || verifyRes.body.payment_id !== mockPaymentId) {
      console.error('❌ TEST 3 FAILED: Payment verification failed:', verifyRes.body);
      process.exit(1);
    }
    console.log('✅ TEST 3 PASSED: Verified Razorpay payment signature successfully');
    console.log(`   Transaction ID: ${verifyRes.body.payment_id}`);
    console.log(`   Total Paid: ₹${verifyRes.body.total_amount_paid}`);

    // 6. Test GET /api/events/my-bookings to verify invoice metadata
    const bookingsRes = await makeRequest('GET', '/api/events/my-bookings', null, {
      Authorization: `Bearer ${userToken}`,
    });

    if (bookingsRes.status !== 200 || !bookingsRes.body.bookings || bookingsRes.body.bookings.length === 0) {
      console.error('❌ TEST 4 FAILED: Could not fetch user bookings:', bookingsRes.body);
      process.exit(1);
    }

    const bookingItem = bookingsRes.body.bookings[0];
    if (bookingItem.payment_id !== mockPaymentId || bookingItem.total_amount_paid !== 998) {
      console.error('❌ TEST 5 FAILED: Invoice metadata mismatch:', bookingItem);
      process.exit(1);
    }
    console.log('✅ TEST 4 PASSED: My Bookings returned accurate invoice metadata (Transaction ID & Total Paid)');

    console.log('\n🎉 ALL RAZORPAY PAYMENT & INVOICE VERIFICATIONS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ VERIFICATION FAILED:', err);
    process.exit(1);
  } finally {
    if (eventId) {
      await prisma.eventRegistration.deleteMany({ where: { event_id: eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    if (userId) {
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    if (server) server.close();
    await prisma.$disconnect();
  }
}

verifyRazorpayAndInvoice();
