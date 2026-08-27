const fs = require('fs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '../templates/confirmation_email_template.html');

let templateHtmlCache = null;

function loadTemplate() {
  if (!templateHtmlCache) {
    templateHtmlCache = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  }
  return templateHtmlCache;
}

/**
 * Module 20a: HTML Email Template Component & Formatter
 * Replaces all merge fields in confirmation_email_template.html with structured booking data.
 *
 * @param {object} data - Booking & Ticket Details
 * @returns {string} Compiled HTML Email markup
 */
function generateConfirmationEmailHtml(data = {}) {
  const rawTemplate = loadTemplate();

  const attendeeName = data.attendee_name || data.userName || data.name || 'Valued Guest';
  const customerEmail = data.customer_email || data.userEmail || data.email || 'customer@example.com';
  const eventTitle = data.event_title || data.eventTitle || 'Community Event';
  const eventDatetime = data.event_datetime || data.eventDate || 'Upcoming Event';

  const fullVenue = [
    data.venue || data.location,
    data.neighborhood,
    data.city,
    data.state,
  ].filter(Boolean).join(', ') || 'Event Venue';

  const passCode = data.pass_code || (data.ticketNumbers && data.ticketNumbers.length > 0 ? `#${data.ticketNumbers.join(', #')}` : 'PASS-ENTRY-001');
  const qrCodeBase64 = data.qr_code_base64 || '';

  const quantity = parseInt(data.quantity, 10) || 1;
  const unitPriceNum = parseFloat(data.unit_price ?? data.ticket_price ?? data.ticketPrice ?? 0);
  const totalPaidNum = parseFloat(data.total_amount ?? data.totalAmountPaid ?? (unitPriceNum * quantity));

  const formattedTicketPrice = unitPriceNum > 0 ? `₹${unitPriceNum.toFixed(2)}` : 'FREE';
  const formattedSubtotal = unitPriceNum > 0 ? `₹${(unitPriceNum * quantity).toFixed(2)}` : '₹0.00 (FREE)';

  const taxNum = parseFloat(data.tax_amount ?? 0);
  const formattedTax = taxNum > 0 ? `₹${taxNum.toFixed(2)}` : '₹0.00 (Included)';

  const formattedTotalPaid = totalPaidNum > 0 ? `₹${totalPaidNum.toFixed(2)}` : '₹0.00 (FREE)';

  const transactionId = data.transaction_id || data.paymentId || data.orderId || 'TXN_FREE_RSVP';

  const paymentDateFormatted = data.payment_date || (data.bookedAt ? new Date(data.bookedAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) : new Date().toLocaleDateString('en-US'));

  const appBaseUrl = (data.app_base_url || process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

  const replacements = {
    '{{attendee_name}}': attendeeName,
    '{{qr_code_base64}}': qrCodeBase64,
    '{{pass_code}}': passCode,
    '{{event_title}}': eventTitle,
    '{{event_datetime}}': eventDatetime,
    '{{venue}}': fullVenue,
    '{{quantity}}': String(quantity),
    '{{transaction_id}}': transactionId,
    '{{payment_date}}': paymentDateFormatted,
    '{{customer_email}}': customerEmail,
    '{{ticket_price}}': formattedTicketPrice,
    '{{subtotal}}': formattedSubtotal,
    '{{tax_amount}}': formattedTax,
    '{{total_amount}}': formattedTotalPaid,
    '{{app_base_url}}': appBaseUrl,
  };

  let compiledHtml = rawTemplate;

  Object.entries(replacements).forEach(([placeholder, value]) => {
    // Replace all occurrences of placeholder
    compiledHtml = compiledHtml.split(placeholder).join(value);
  });

  return compiledHtml;
}

module.exports = {
  generateConfirmationEmailHtml,
  loadTemplate,
};
