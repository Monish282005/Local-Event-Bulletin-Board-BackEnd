const axios = require('axios');
const nodemailer = require('nodemailer');
const { generateQrCodeBase64 } = require('./qrCodeHelper');
const { generateConfirmationEmailHtml } = require('./emailTemplateHelper');

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_dtdc1i7';
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_o68loll';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || 'XKPihqhW-GdZF_BwL';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';

/**
 * Configures Nodemailer SMTP transport fallback.
 */
function getTransporter() {
  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 5000,
    });
  }

  return nodemailer.createTransport({
    jsonTransport: true,
  });
}

const transporter = getTransporter();

/**
 * Module 21: Ticket Confirmation & Invoice Email Dispatcher
 * Sends confirmation email containing digital ticket pass, QR code, and itemized invoice.
 *
 * @param {object} bookingDetails - Detailed ticket booking object
 * @returns {Promise<boolean>} Success status
 */
async function sendTicketConfirmationEmail(bookingDetails) {
  if (!bookingDetails || (!bookingDetails.userEmail && !bookingDetails.customer_email)) {
    console.warn('[EmailService] Missing userEmail for confirmation email dispatch.');
    return false;
  }

  const recipientEmail = bookingDetails.userEmail || bookingDetails.customer_email;
  const attendeeName = bookingDetails.userName || bookingDetails.attendee_name || bookingDetails.name || 'Valued Guest';
  const eventTitle = bookingDetails.eventTitle || bookingDetails.event_title || 'Local Event';
  const eventDate = bookingDetails.eventDate || bookingDetails.event_datetime || 'Upcoming Event';

  const fullVenue = [
    bookingDetails.location || bookingDetails.venue,
    bookingDetails.neighborhood,
    bookingDetails.city,
    bookingDetails.state,
  ].filter(Boolean).join(', ') || 'Venue Location';

  const quantity = parseInt(bookingDetails.quantity, 10) || 1;
  const ticketNumbers = bookingDetails.ticketNumbers || (bookingDetails.ticket_number ? [bookingDetails.ticket_number] : []);

  // Determine unique Pass Code
  let passCode = bookingDetails.passCode || bookingDetails.pass_code;
  if (!passCode) {
    if (ticketNumbers.length > 0) {
      passCode = `PASS-${ticketNumbers.join('-')}`;
    } else if (bookingDetails.paymentId || bookingDetails.transaction_id) {
      passCode = `PASS-${(bookingDetails.paymentId || bookingDetails.transaction_id).slice(-8).toUpperCase()}`;
    } else {
      passCode = `PASS-${Math.floor(100000 + Math.random() * 900000)}`;
    }
  }

  // Step 1: Generate Base64 QR Code encoding the Pass Code
  let qrCodeBase64 = '';
  try {
    qrCodeBase64 = await generateQrCodeBase64(passCode);
  } catch (err) {
    console.warn('[EmailService] Notice: Failed to generate QR code Base64:', err.message);
  }

  const unitPrice = parseFloat(bookingDetails.ticketPrice ?? bookingDetails.ticket_price ?? 0);
  const totalAmountPaid = parseFloat(bookingDetails.totalAmountPaid ?? bookingDetails.total_amount ?? (unitPrice * quantity));
  const transactionId = bookingDetails.paymentId || bookingDetails.transaction_id || bookingDetails.orderId || 'TXN_FREE_RSVP';

  const formattedBookedDate = bookingDetails.bookedAt
    ? new Date(bookingDetails.bookedAt).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    : new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });

  const formattedTicketPrice = unitPrice > 0 ? `₹${unitPrice.toFixed(2)}` : 'FREE';
  const formattedSubtotal = unitPrice > 0 ? `₹${(unitPrice * quantity).toFixed(2)}` : '₹0.00 (FREE)';
  const formattedTotalPaid = totalAmountPaid > 0 ? `₹${totalAmountPaid.toFixed(2)}` : '₹0.00 (FREE)';
  const appBaseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');

  // Step 2: Compile HTML Email using the attached HTML Email Template
  const htmlContent = generateConfirmationEmailHtml({
    attendee_name: attendeeName,
    customer_email: recipientEmail,
    event_title: eventTitle,
    event_datetime: eventDate,
    venue: fullVenue,
    pass_code: passCode,
    qr_code_base64: qrCodeBase64,
    quantity,
    ticket_price: unitPrice,
    total_amount: totalAmountPaid,
    transaction_id: transactionId,
    payment_date: formattedBookedDate,
    app_base_url: appBaseUrl,
  });

  // Step 3: Prepare complete EmailJS template parameters (matching template merge fields exactly)
  const templateParams = {
    // Exact merge fields from HTML Email Template
    attendee_name: attendeeName,
    event_title: eventTitle,
    event_datetime: eventDate,
    venue: fullVenue,
    pass_code: passCode,
    qr_code_base64: qrCodeBase64,
    quantity: String(quantity),
    transaction_id: transactionId,
    payment_date: formattedBookedDate,
    customer_email: recipientEmail,
    ticket_price: formattedTicketPrice,
    subtotal: formattedSubtotal,
    tax_amount: '₹0.00 (Included)',
    total_amount: formattedTotalPaid,
    app_base_url: appBaseUrl,

    // EmailJS routing fallbacks
    to_email: recipientEmail,
    user_email: recipientEmail,
    email: recipientEmail,
    to: recipientEmail,
    recipient: recipientEmail,
    recipient_email: recipientEmail,
    reply_to: recipientEmail,

    to_name: attendeeName,
    user_name: attendeeName,
    name: attendeeName,

    event_name: eventTitle,
    event_date: eventDate,
    event_location: fullVenue,
    ticket_type: ticketNumbers.length > 0 ? `Pass (${passCode})` : 'Standard Entry Pass',
    amount: totalAmountPaid.toFixed(2),
    payment_id: transactionId,
    order_id: bookingDetails.orderId || 'ORD_FREE',
  };

  // Step 4: Dispatch email (Try EmailJS first. If successful, DO NOT duplicate via Nodemailer)
  try {
    const payload = {
      service_id: EMAILJS_SERVICE_ID,
      template_id: EMAILJS_TEMPLATE_ID,
      user_id: EMAILJS_PUBLIC_KEY,
      template_params: templateParams,
    };

    if (EMAILJS_PRIVATE_KEY) {
      payload.accessToken = EMAILJS_PRIVATE_KEY;
    }

    const response = await axios.post('https://api.emailjs.com/api/v1.0/email/send', payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    });

    if (response.status === 200 || response.data === 'OK') {
      console.log(`[EmailJS] ✅ Confirmation email sent successfully to ${recipientEmail} via EmailJS (Service: ${EMAILJS_SERVICE_ID}, Template: ${EMAILJS_TEMPLATE_ID})`);
      return true; // Return immediately to avoid sending duplicate email via Nodemailer
    }
  } catch (err) {
    console.warn(`[EmailJS] Notice: EmailJS dispatch returned (${err.response?.status}):`, err.response?.data || err.message);
  }

  // Fallback to Nodemailer transporter ONLY if EmailJS was not sent
  try {
    const fromEmail = process.env.EMAIL_FROM || '"Local Event Bulletin Board" <no-reply@localeventbulletin.com>';

    const mailOptions = {
      from: fromEmail,
      to: recipientEmail,
      subject: `✅ Registration Confirmed & Pass - ${eventTitle}`,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✅ Digital Pass & Invoice email dispatched via Nodemailer fallback to ${recipientEmail}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to dispatch Nodemailer fallback email:`, error.message);
    return false;
  }
}

/**
 * Backwards-compatibility alias for sendInvoiceEmail
 */
async function sendInvoiceEmail(invoiceDetails) {
  return sendTicketConfirmationEmail(invoiceDetails);
}

module.exports = {
  sendTicketConfirmationEmail,
  sendInvoiceEmail,
  generateInvoiceHtml: generateConfirmationEmailHtml,
};
