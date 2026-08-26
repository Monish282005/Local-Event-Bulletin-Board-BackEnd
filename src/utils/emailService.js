const axios = require('axios');
const nodemailer = require('nodemailer');

const EMAILJS_SERVICE_ID = process.env.EMAILJS_SERVICE_ID || 'service_dtdc1i7';
const EMAILJS_TEMPLATE_ID = process.env.EMAILJS_TEMPLATE_ID || 'template_o68loll';
const EMAILJS_PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || 'XKPihqhW-GdZF_BwL';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || '';

/**
 * Creates and configures Nodemailer SMTP transport fallback.
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
 * Generates the user's exact requested HTML invoice template.
 */
function generateInvoiceHtml({
  userName,
  userEmail,
  eventTitle,
  eventDate,
  location,
  neighborhood,
  city,
  state,
  organizerName,
  organizerEmail,
  ticketNumbers = [],
  quantity = 1,
  ticketPrice = 0,
  totalAmountPaid = 0,
  paymentId = 'FREE_RSVP',
  orderId = 'ORD_FREE',
  bookedAt = new Date().toISOString(),
}) {
  const formattedBookedDate = new Date(bookedAt).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const fullLocation = [location, neighborhood, city, state].filter(Boolean).join(', ');

  return `
<div style="font-family: Arial, sans-serif; background:#f5f5f5; padding:30px;">
  <div style="max-width:650px; margin:auto; background:#ffffff; border-radius:12px; overflow:hidden;">

    <!-- Header -->
    <div style="background:#111827; color:white; padding:25px 30px;">
      <h1 style="margin:0; font-size:24px;">Local Event</h1>
      <p style="margin:8px 0 0; color:#d1d5db;">
        Payment Confirmation & Invoice
      </p>
    </div>

    <!-- Success -->
    <div style="padding:30px;">
      <h2 style="color:#16a34a; margin-top:0;">
        ✓ Payment Successful
      </h2>

      <p style="font-size:16px; color:#374151;">
        Hi <strong>${userName}</strong>,
      </p>

      <p style="color:#4b5563; line-height:1.6;">
        Thank you for registering for the event. Your payment has been
        successfully completed and your booking is confirmed.
      </p>

      <!-- Event Details -->
      <div style="background:#f9fafb; border-radius:10px; padding:20px; margin:25px 0;">
        <h3 style="margin-top:0; color:#111827;">Event Details</h3>

        <p><strong>Event:</strong> ${eventTitle}</p>
        <p><strong>Date:</strong> ${eventDate}</p>
        <p><strong>Location:</strong> ${fullLocation}</p>
        <p><strong>Ticket:</strong> Entry Pass ${ticketNumbers.length > 0 ? `(#${ticketNumbers.join(', #')})` : ''}</p>
        <p><strong>Quantity:</strong> ${quantity}</p>
      </div>

      <!-- Payment Details -->
      <div style="background:#f9fafb; border-radius:10px; padding:20px; margin:25px 0;">
        <h3 style="margin-top:0; color:#111827;">Payment Details</h3>

        <p><strong>Amount Paid:</strong> ₹${totalAmountPaid.toFixed(2)}</p>
        <p><strong>Payment ID:</strong> ${paymentId}</p>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Payment Date:</strong> ${formattedBookedDate}</p>
      </div>

      <div style="border-top:1px solid #e5e7eb; padding-top:20px; margin-top:25px;">
        <p style="color:#6b7280; font-size:14px;">
          Please keep this email as your payment confirmation and invoice
          for your records.
        </p>

        <p style="color:#6b7280; font-size:14px;">
          We look forward to seeing you at the event!
        </p>
      </div>

      <p style="margin-top:30px; color:#111827;">
        Regards,<br>
        <strong>Local Event Team</strong>
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f3f4f6; padding:18px 30px; text-align:center;">
      <p style="margin:0; color:#6b7280; font-size:12px;">
        This is an automated payment confirmation from Local Event.
      </p>
    </div>

  </div>
</div>
  `;
}

/**
 * Sends invoice email using EmailJS API service (service_dtdc1i7 / template_o68loll) with Nodemailer fallback.
 */
async function sendInvoiceEmail(invoiceDetails) {
  if (!invoiceDetails || !invoiceDetails.userEmail) {
    console.warn('[EmailService] Missing userEmail for invoice dispatch.');
    return false;
  }

  const formattedBookedDate = invoiceDetails.bookedAt
    ? new Date(invoiceDetails.bookedAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : new Date().toLocaleDateString('en-US');

  const fullLocation = [
    invoiceDetails.location,
    invoiceDetails.neighborhood,
    invoiceDetails.city,
    invoiceDetails.state,
  ].filter(Boolean).join(', ');

  const templateParams = {
    to_email: invoiceDetails.userEmail,
    user_email: invoiceDetails.userEmail,
    email: invoiceDetails.userEmail,
    to: invoiceDetails.userEmail,
    recipient: invoiceDetails.userEmail,
    recipient_email: invoiceDetails.userEmail,
    reply_to: invoiceDetails.userEmail,

    to_name: invoiceDetails.userName || 'Valued Customer',
    user_name: invoiceDetails.userName || 'Valued Customer',
    name: invoiceDetails.userName || 'Valued Customer',

    event_name: invoiceDetails.eventTitle || 'Local Event',
    event_title: invoiceDetails.eventTitle || 'Local Event',
    event_date: invoiceDetails.eventDate || 'N/A',
    event_location: fullLocation || 'Venue Location',
    ticket_type: invoiceDetails.ticketNumbers && invoiceDetails.ticketNumbers.length > 0
      ? `Entry Pass (#${invoiceDetails.ticketNumbers.join(', #')})`
      : 'Standard Entry Pass',
    quantity: invoiceDetails.quantity || 1,
    amount: (invoiceDetails.totalAmountPaid || 0).toFixed(2),
    payment_id: invoiceDetails.paymentId || 'FREE_RSVP',
    order_id: invoiceDetails.orderId || 'ORD_FREE',
    payment_date: formattedBookedDate,
  };

  let emailJsSuccess = false;

  // 1. Try sending via EmailJS REST API
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
      console.log(`[EmailJS] ✅ Invoice email sent successfully to ${invoiceDetails.userEmail} via EmailJS (Service: ${EMAILJS_SERVICE_ID}, Template: ${EMAILJS_TEMPLATE_ID})`);
      emailJsSuccess = true;
    }
  } catch (err) {
    console.warn(`[EmailJS] Notice: EmailJS dispatch returned (${err.response?.status}):`, err.response?.data || err.message);
  }

  // 2. Send via Nodemailer transporter with exact requested HTML invoice template
  try {
    const fromEmail = process.env.EMAIL_FROM || '"Local Event" <no-reply@localeventbulletin.com>';
    const htmlContent = generateInvoiceHtml(invoiceDetails);

    const mailOptions = {
      from: fromEmail,
      to: invoiceDetails.userEmail,
      subject: `✓ Payment Confirmation & Invoice - ${invoiceDetails.eventTitle}`,
      html: htmlContent,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[EmailService] ✅ Invoice email dispatched to ${invoiceDetails.userEmail}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to dispatch Nodemailer fallback email:`, error.message);
    return emailJsSuccess;
  }
}

module.exports = {
  sendInvoiceEmail,
  generateInvoiceHtml,
};
