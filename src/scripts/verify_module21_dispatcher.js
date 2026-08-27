const { sendTicketConfirmationEmail, sendInvoiceEmail } = require('../utils/emailService');

async function verifyModule21() {
  console.log('================================================================');
  console.log('  MODULE 21 VERIFICATION: EMAIL DISPATCHER & INTEGRATION       ');
  console.log('================================================================\n');

  try {
    const mockBooking = {
      userName: 'Sophia Martinez',
      userEmail: 'sophia.martinez@example.com',
      eventTitle: 'Indie Music Fest 2026',
      eventDate: 'Sun, Sep 20, 2026 at 06:00 PM',
      location: 'Palace Grounds',
      neighborhood: 'Jayamahal',
      city: 'Bengaluru',
      state: 'Karnataka',
      ticketNumbers: ['TK-881', 'TK-882'],
      quantity: 2,
      ticketPrice: 500,
      totalAmountPaid: 1000,
      paymentId: 'pay_MOCK_DISPATCH_908',
      orderId: 'order_MOCK_DISPATCH_102',
      bookedAt: new Date().toISOString(),
    };

    console.log('▶ Dispatching test email via sendTicketConfirmationEmail...');
    const result1 = await sendTicketConfirmationEmail(mockBooking);

    if (!result1) {
      throw new Error('TEST 1 FAILED: sendTicketConfirmationEmail returned false!');
    }
    console.log('✅ TEST 1 PASSED: sendTicketConfirmationEmail executed successfully!\n');

    console.log('▶ Verifying backwards compatibility via sendInvoiceEmail alias...');
    const result2 = await sendInvoiceEmail(mockBooking);

    if (!result2) {
      throw new Error('TEST 2 FAILED: sendInvoiceEmail alias returned false!');
    }
    console.log('✅ TEST 2 PASSED: sendInvoiceEmail alias executed successfully!\n');

    console.log('================================================================');
    console.log('🎉 MODULE 21 ACCEPTANCE CRITERIA PASSED 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ MODULE 21 VERIFICATION FAILED:', err.message);
    process.exit(1);
  }
}

verifyModule21();
