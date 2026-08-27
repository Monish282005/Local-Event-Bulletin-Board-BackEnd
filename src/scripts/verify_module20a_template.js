const { generateConfirmationEmailHtml } = require('../utils/emailTemplateHelper');
const { generateQrCodeBase64 } = require('../utils/qrCodeHelper');

async function verifyModule20a() {
  console.log('================================================================');
  console.log('  MODULE 20a VERIFICATION: HTML EMAIL TEMPLATE FORMATTER        ');
  console.log('================================================================\n');

  try {
    // 1. Generate QR Code
    const samplePassCode = 'PASS-9842-CONFIRM';
    const qrBase64 = await generateQrCodeBase64(samplePassCode);

    // 2. Generate HTML Email from Template
    const mockData = {
      attendee_name: 'Alex Rivera',
      customer_email: 'alex.rivera@example.com',
      event_title: 'Bangalore Tech Summit 2026',
      event_datetime: 'Fri, Sep 12, 2026 at 10:00 AM',
      venue: 'BIEC Convention Hall, Tumkur Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      pass_code: samplePassCode,
      qr_code_base64: qrBase64,
      quantity: 2,
      ticket_price: 750,
      total_amount: 1500,
      transaction_id: 'pay_PZ872910482',
      payment_date: 'Aug 27, 2026',
      app_base_url: 'http://localhost:5173',
    };

    const compiledHtml = generateConfirmationEmailHtml(mockData);

    // Test 1: Ensure no unreplaced {{...}} placeholders exist
    const orphanMatch = compiledHtml.match(/\{\{[a-zA-Z0-9_]+\}\}/g);
    if (orphanMatch && orphanMatch.length > 0) {
      throw new Error(`TEST 1 FAILED: Found orphaned placeholders in HTML output: ${orphanMatch.join(', ')}`);
    }
    console.log('✅ TEST 1 PASSED: 100% of merge fields ({{placeholders}}) were successfully replaced.');

    // Test 2: Check required content elements
    const requiredStrings = [
      'Hi Alex Rivera',
      'Bangalore Tech Summit 2026',
      samplePassCode,
      'pay_PZ872910482',
      '₹750.00',
      '₹1500.00',
      'alex.rivera@example.com',
      'http://localhost:5173/my-bookings',
    ];

    for (const reqStr of requiredStrings) {
      if (!compiledHtml.includes(reqStr)) {
        throw new Error(`TEST 2 FAILED: Expected string "${reqStr}" not found in output HTML!`);
      }
    }
    console.log('✅ TEST 2 PASSED: All rendered data values, prices, transaction IDs & CTA links are present in HTML.');

    // Test 3: Check QR Code image inclusion
    if (!compiledHtml.includes(qrBase64)) {
      throw new Error('TEST 3 FAILED: Base64 QR Code image string was not found in <img> src attribute!');
    }
    console.log('✅ TEST 3 PASSED: Scannable QR Code base64 image embedded cleanly into pass card.\n');

    console.log('================================================================');
    console.log('🎉 MODULE 20a ACCEPTANCE CRITERIA PASSED 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ MODULE 20a VERIFICATION FAILED:', err.message);
    process.exit(1);
  }
}

verifyModule20a();
