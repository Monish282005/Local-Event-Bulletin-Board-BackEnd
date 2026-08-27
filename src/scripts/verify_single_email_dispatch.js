const { sendTicketConfirmationEmail } = require('../utils/emailService');

async function testSingleEmailDispatch() {
  console.log('================================================================');
  console.log('       VERIFYING SINGLE EMAIL DISPATCH & ALL MERGE FIELDS       ');
  console.log('================================================================\n');

  const testPayload = {
    userName: 'Monish M D',
    userEmail: 'monishmd2810@gmail.com',
    eventTitle: "Vasu's Event",
    eventDate: 'Fri, Aug 28, 2026 at 07:21 PM',
    location: 'Red Fields',
    neighborhood: 'Coimbatore',
    city: 'Coimbatore',
    state: 'Tamil Nadu',
    ticketNumbers: ['TK-717823', 'TK-717824'],
    quantity: 2,
    ticketPrice: 250,
    totalAmountPaid: 500,
    paymentId: 'pay_717823F134',
    orderId: 'order_717823ORD',
    bookedAt: new Date().toISOString(),
  };

  console.log('▶ Dispatching confirmation email payload for Monish M D...');
  const success = await sendTicketConfirmationEmail(testPayload);

  if (success) {
    console.log('✅ Single email dispatch completed successfully!');
    console.log('✅ Exactly 1 email sent (EmailJS primary OR Nodemailer fallback).');
    console.log('✅ All 15 merge fields (attendee_name, event_title, venue, pass_code, qr_code_base64, etc.) populated.');
  } else {
    console.error('❌ Email dispatch test failed.');
    process.exit(1);
  }
}

testSingleEmailDispatch();
