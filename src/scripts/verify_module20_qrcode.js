const { generateQrCodeBase64 } = require('../utils/qrCodeHelper');

async function verifyModule20() {
  console.log('================================================================');
  console.log('   MODULE 20 VERIFICATION: QR CODE GENERATOR UTILITY          ');
  console.log('================================================================\n');

  try {
    // Test 1: Valid Pass Code Base64 Generation
    const samplePassCode = 'PASS-EXP-2026-9042';
    const qrBase64 = await generateQrCodeBase64(samplePassCode);

    if (!qrBase64 || typeof qrBase64 !== 'string') {
      throw new Error('TEST 1 FAILED: Result is not a string!');
    }

    if (!qrBase64.startsWith('data:image/png;base64,')) {
      throw new Error('TEST 1 FAILED: Result does not start with data:image/png;base64, prefix!');
    }

    const base64DataOnly = qrBase64.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64DataOnly, 'base64');

    if (buffer.length < 100) {
      throw new Error('TEST 1 FAILED: Generated image buffer size is suspiciously small!');
    }

    console.log('✅ TEST 1 PASSED: Successfully generated PNG Base64 Data URL for pass code.');
    console.log(`   Sample Payload: "${samplePassCode}"`);
    console.log(`   Data URL Prefix: "${qrBase64.slice(0, 45)}..."`);
    console.log(`   Buffer Size: ${buffer.length} bytes\n`);

    // Test 2: Input Validation (Empty String Handling)
    try {
      await generateQrCodeBase64('');
      throw new Error('TEST 2 FAILED: Empty payload was not rejected!');
    } catch (err) {
      if (err.message.includes('required to generate QR code')) {
        console.log('✅ TEST 2 PASSED: Invalid/empty payload correctly rejected with descriptive error.');
      } else {
        throw err;
      }
    }

    console.log('\n================================================================');
    console.log('🎉 MODULE 20 ACCEPTANCE CRITERIA PASSED 100%!');
    console.log('================================================================');
  } catch (err) {
    console.error('❌ MODULE 20 VERIFICATION FAILED:', err.message);
    process.exit(1);
  }
}

verifyModule20();
