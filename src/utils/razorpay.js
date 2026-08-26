const Razorpay = require('razorpay');
const crypto = require('crypto');

const key_id = process.env.RAZORPAY_KEY_ID || 'rzp_test_TULuQjSNHLksoX';
const key_secret = process.env.RAZORPAY_KEY_SECRET || 'M8Er3GWPex31P60lhHzYRJq1';

const razorpayInstance = new Razorpay({
  key_id,
  key_secret,
});

/**
 * Verify Razorpay HMAC SHA256 payment signature
 */
function verifyRazorpaySignature(orderId, paymentId, signature) {
  if (!orderId || !paymentId || !signature) return false;
  const body = orderId + '|' + paymentId;
  const expectedSignature = crypto
    .createHmac('sha256', key_secret)
    .update(body.toString())
    .digest('hex');
  return expectedSignature === signature;
}

module.exports = {
  razorpayInstance,
  verifyRazorpaySignature,
  key_id,
};
