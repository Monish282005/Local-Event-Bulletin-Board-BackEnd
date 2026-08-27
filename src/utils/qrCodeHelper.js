const QRCode = require('qrcode');

/**
 * Module 20: QR Code Generator Utility
 * Generates a high-resolution, scannable PNG Data URL (Base64) representation of a pass code or payload.
 *
 * @param {string} dataText - The text payload to encode into QR Code (e.g., pass code 'PASS-8921-X3')
 * @param {object} customOptions - Optional configuration overrides for qrcode library
 * @returns {Promise<string>} Base64 Data URL (e.g., 'data:image/png;base64,iVBORw0KGgo...')
 */
async function generateQrCodeBase64(dataText, customOptions = {}) {
  if (!dataText || typeof dataText !== 'string' || !dataText.trim()) {
    throw new Error('[QRCodeHelper] Error: dataText string payload is required to generate QR code.');
  }

  const defaultOptions = {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    quality: 0.95,
    margin: 1,
    width: 250,
    color: {
      dark: '#1B2A4A',  // Navy primary accent matching email template header
      light: '#FFFFFF', // Crisp white background
    },
  };

  const options = { ...defaultOptions, ...customOptions };

  try {
    const dataUrl = await QRCode.toDataURL(dataText.trim(), options);
    return dataUrl;
  } catch (err) {
    console.error('[QRCodeHelper] Failed to generate QR code Data URL:', err.message);
    throw new Error(`Failed to generate QR code: ${err.message}`);
  }
}

module.exports = {
  generateQrCodeBase64,
};
