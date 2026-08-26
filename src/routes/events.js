const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/auth');
const { optionalAuthenticate } = require('../middleware/auth');
const { isValidLocationCombo } = require('../utils/locationData');
const { uploadToCloudinary } = require('../utils/cloudinary');
const { razorpayInstance, verifyRazorpaySignature, key_id } = require('../utils/razorpay');
const { sendInvoiceEmail } = require('../utils/emailService');

const router = express.Router();
const prisma = new PrismaClient();

const VALID_CATEGORIES = ['sports', 'music', 'food', 'yard_sale', 'other'];

function isValidFutureDate(dateStr) {
  const d = new Date(dateStr);
  return !isNaN(d.getTime()) && d.getTime() > Date.now();
}

function getDateFilterClause(datePreset, startDateStr, endDateStr) {
  const now = new Date();

  if (datePreset === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    return { gte: startOfToday, lte: endOfToday };
  }

  if (datePreset === 'tomorrow') {
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
    const endOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 23, 59, 59, 999);
    return { gte: startOfTomorrow, lte: endOfTomorrow };
  }

  if (datePreset === 'this_weekend') {
    const dayOfWeek = now.getDay();
    const daysUntilSaturday = (6 - dayOfWeek + 7) % 7;
    const startOfSaturday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday, 0, 0, 0, 0);
    const endOfSunday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSaturday + 1, 23, 59, 59, 999);
    return { gte: startOfSaturday, lte: endOfSunday };
  }

  if (datePreset === 'this_week') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 23, 59, 59, 999);
    return { gte: startOfToday, lte: endOfWeek };
  }

  if (datePreset === 'custom' || startDateStr || endDateStr) {
    const clause = {};
    if (startDateStr) {
      const s = new Date(startDateStr);
      if (!isNaN(s.getTime())) clause.gte = s;
    }
    if (endDateStr) {
      const e = new Date(endDateStr);
      if (!isNaN(e.getTime())) {
        e.setHours(23, 59, 59, 999);
        clause.lte = e;
      }
    }
    if (Object.keys(clause).length > 0) return clause;
  }

  return null;
}

// POST /api/events (Create Event - Auth required)
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      title,
      description,
      category,
      location,
      neighborhood,
      event_datetime,
      country,
      state,
      district,
      city,
    } = req.body;

    if (!title || !description || !category || !location || !neighborhood || !event_datetime) {
      return res.status(400).json({
        error: 'Missing required event fields (title, description, category, location, neighborhood, event_datetime).'
      });
    }

    if (
      !country || typeof country !== 'string' || !country.trim() ||
      !state || typeof state !== 'string' || !state.trim() ||
      !district || typeof district !== 'string' || !district.trim() ||
      !city || typeof city !== 'string' || !city.trim()
    ) {
      return res.status(400).json({
        error: 'Country, state, district, and city are required.'
      });
    }

    // Canonical location combination check
    if (!isValidLocationCombo(country, state, district, city)) {
      return res.status(400).json({
        error: 'Invalid location selection combination.'
      });
    }

    // Category validation
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`
      });
    }

    // Future date validation
    if (!isValidFutureDate(event_datetime)) {
      return res.status(400).json({
        error: 'event_datetime must be a valid future timestamp.'
      });
    }

    const totalTicketsNum = Math.max(1, parseInt(req.body.total_tickets, 10) || 50);
    const ticketPriceNum = Math.max(0, parseFloat(req.body.ticket_price) || 0);
    const allowCancellationBool = req.body.allow_cancellation !== undefined ? Boolean(req.body.allow_cancellation) : true;
    let imageUrlStr = req.body.image_url && typeof req.body.image_url === 'string' && req.body.image_url.trim() ? req.body.image_url.trim() : null;

    if (imageUrlStr) {
      try {
        const cloudinaryUrl = await uploadToCloudinary(imageUrlStr);
        if (cloudinaryUrl) {
          imageUrlStr = cloudinaryUrl;
        }
      } catch (err) {
        console.warn('Cloudinary upload warning:', err);
      }
    }

    const newEvent = await prisma.event.create({
      data: {
        id: uuidv4(),
        title: title.trim(),
        description: description.trim(),
        category,
        location: location.trim(),
        neighborhood: neighborhood.trim(),
        country: country.trim(),
        state: state.trim(),
        district: district.trim(),
        city: city.trim(),
        event_datetime: new Date(event_datetime),
        total_tickets: totalTicketsNum,
        ticket_price: ticketPriceNum,
        allow_cancellation: allowCancellationBool,
        image_url: imageUrlStr,
        created_by: req.user.id,
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(201).json(newEvent);
  } catch (error) {
    console.error('Error creating event:', error);
    return res.status(500).json({ error: 'Internal server error creating event.' });
  }
});


// GET /api/events/my-events (List active non-soft-deleted events created by logged-in user - Auth required)
router.get('/my-events', authenticate, async (req, res) => {
  try {
    const { page, limit } = req.query;

    const whereClause = {
      created_by: req.user.id,
      is_expired: false,
      deleted_at: null,
    };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 6));
    const skip = (pageNum - 1) * limitNum;

    const total = await prisma.event.count({ where: whereClause });

    const events = await prisma.event.findMany({
      where: whereClause,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy: {
        event_datetime: 'asc',
      },
      skip,
      take: limitNum,
    });

    const totalPages = Math.ceil(total / limitNum) || 0;
    const pagination = {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    return res.status(200).json({ events, pagination });
  } catch (error) {
    console.error('Error fetching user created events:', error);
    return res.status(500).json({ error: 'Internal server error fetching your created events.' });
  }
});


// GET /api/events/my-bookings (List non-soft-deleted event registrations for logged-in user - Auth required)
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: {
        user_id: req.user.id,
        deleted_at: null,
        event: {
          deleted_at: null,
        },
      },
      include: {
        event: {
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Group registrations by event_id
    const groupedMap = new Map();

    for (const reg of registrations) {
      if (!reg.event || reg.event.is_expired || reg.event.deleted_at !== null) continue;

      const eventId = reg.event.id;
      if (!groupedMap.has(eventId)) {
        groupedMap.set(eventId, {
          event: reg.event,
          total_user_tickets: 0,
          ticket_numbers: [],
          booked_at: reg.created_at,
          payment_id: reg.payment_id || null,
          order_id: reg.order_id || null,
          amount_paid: reg.amount_paid || 0,
          total_amount_paid: 0,
        });
      }

      const item = groupedMap.get(eventId);
      item.total_user_tickets += 1;
      item.ticket_numbers.push(reg.ticket_number);
      item.total_amount_paid += (reg.amount_paid || (reg.event.ticket_price || 0));
      if (!item.payment_id && reg.payment_id) item.payment_id = reg.payment_id;
      if (!item.order_id && reg.order_id) item.order_id = reg.order_id;
    }

    const { page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 6));
    const skip = (pageNum - 1) * limitNum;

    const allBookings = Array.from(groupedMap.values());
    const total = allBookings.length;
    const totalPages = Math.ceil(total / limitNum) || 0;
    const paginatedBookings = allBookings.slice(skip, skip + limitNum);

    const pagination = {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    return res.status(200).json({
      bookings: paginatedBookings,
      total_bookings: total,
      pagination,
    });
  } catch (error) {
    console.error('Error fetching user bookings:', error);
    return res.status(500).json({ error: 'Internal server error fetching your bookings.' });
  }
});


// GET /api/events (List non-expired, active non-soft-deleted events - Public for search & filter)
router.get('/', async (req, res) => {
  try {
    const {
      neighborhood,
      category,
      search,
      query,
      q,
      datePreset,
      startDate,
      endDate,
      sort,
      page,
      limit,
      paginate,
    } = req.query;

    const whereClause = {
      is_expired: false,
      deleted_at: null,
    };

    const searchParam = neighborhood || search || query || q;
    if (searchParam && typeof searchParam === 'string' && searchParam.trim()) {
      const searchTerm = searchParam.trim();
      whereClause.OR = [
        { city: { contains: searchTerm } },
        { district: { contains: searchTerm } },
        { neighborhood: { contains: searchTerm } },
        { state: { contains: searchTerm } },
        { title: { contains: searchTerm } },
        { location: { contains: searchTerm } },
        { description: { contains: searchTerm } },
      ];
    }

    if (category && typeof category === 'string' && category.trim() && category.trim() !== 'all') {
      if (VALID_CATEGORIES.includes(category.trim())) {
        whereClause.category = category.trim();
      } else {
        if (page || limit || paginate === 'true') {
          return res.status(200).json({
            events: [],
            pagination: { total: 0, page: 1, limit: 9, totalPages: 0, hasNextPage: false, hasPrevPage: false },
          });
        }
        return res.status(200).json([]);
      }
    }

    const dateClause = getDateFilterClause(datePreset, startDate, endDate);
    if (dateClause) {
      whereClause.event_datetime = dateClause;
    }

    let orderBy = { event_datetime: 'asc' };
    if (sort === 'datetime_desc') orderBy = { event_datetime: 'desc' };
    else if (sort === 'created_desc') orderBy = { created_at: 'desc' };
    else if (sort === 'popularity_desc') orderBy = { rsvp_count: 'desc' };

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 9));
    const skip = (pageNum - 1) * limitNum;

    const total = await prisma.event.count({ where: whereClause });

    const events = await prisma.event.findMany({
      where: whereClause,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy,
      skip,
      take: limitNum,
    });

    const totalPages = Math.ceil(total / limitNum) || 0;
    const pagination = {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
    };

    if (page || limit || paginate === 'true') {
      return res.status(200).json({ events, pagination });
    }

    res.setHeader('X-Total-Count', total);
    return res.status(200).json(events);
  } catch (error) {
    console.error('Error listing events:', error);
    return res.status(500).json({ error: 'Internal server error listing events.' });
  }
});

// GET /api/events/feed (Hierarchical Tiered Event Feed: Top Picks -> State Events -> Country Events)
router.get('/feed', optionalAuthenticate, async (req, res) => {
  try {
    let userCountry = 'India';
    let userState = 'Karnataka';
    let userCity = 'Bengaluru';
    let isUserLoggedIn = false;

    if (req.user && req.user.id) {
      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
      });
      if (dbUser) {
        userCountry = dbUser.country;
        userState = dbUser.state;
        userCity = dbUser.city;
        isUserLoggedIn = true;
      }
    }

    if (req.query.city && typeof req.query.city === 'string' && req.query.city.trim()) {
      userCity = req.query.city.trim();
      const cityLower = userCity.toLowerCase();

      const cityStateMap = {
        'bengaluru': { state: 'Karnataka', country: 'India' },
        'bangalore': { state: 'Karnataka', country: 'India' },
        'coimbatore': { state: 'Tamil Nadu', country: 'India' },
        'chennai': { state: 'Tamil Nadu', country: 'India' },
        'mumbai': { state: 'Maharashtra', country: 'India' },
        'pune': { state: 'Maharashtra', country: 'India' },
        'delhi': { state: 'Delhi', country: 'India' },
        'delhi ncr': { state: 'Delhi', country: 'India' },
        'hyderabad': { state: 'Telangana', country: 'India' },
        'kolkata': { state: 'West Bengal', country: 'India' },
        'ahmedabad': { state: 'Gujarat', country: 'India' },
        'kochi': { state: 'Kerala', country: 'India' },
        'mysuru': { state: 'Karnataka', country: 'India' },
        'chandigarh': { state: 'Punjab', country: 'India' },
      };

      if (cityStateMap[cityLower]) {
        userState = cityStateMap[cityLower].state;
        userCountry = cityStateMap[cityLower].country;
      } else {
        const cityEvent = await prisma.event.findFirst({
          where: { city: { contains: userCity }, deleted_at: null },
          select: { state: true, country: true },
        });
        if (cityEvent) {
          if (cityEvent.state) userState = cityEvent.state;
          if (cityEvent.country) userCountry = cityEvent.country;
        }
      }
    }
    if (req.query.state && typeof req.query.state === 'string' && req.query.state.trim()) {
      userState = req.query.state.trim();
    }
    if (req.query.country && typeof req.query.country === 'string' && req.query.country.trim()) {
      userCountry = req.query.country.trim();
    }

    const {
      category,
      search,
      query,
      q,
      datePreset,
      startDate,
      endDate,
      sort,
      topPicksPage,
      statePage,
      countryPage,
      limit,
    } = req.query;

    const categoryFilter = (category && typeof category === 'string' && VALID_CATEGORIES.includes(category.trim()))
      ? category.trim()
      : null;

    const dateClause = getDateFilterClause(datePreset, startDate, endDate);

    const baseWhere = {
      is_expired: false,
      deleted_at: null,
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(dateClause ? { event_datetime: dateClause } : {}),
    };

    const searchParam = search || query || q;
    if (searchParam && typeof searchParam === 'string' && searchParam.trim()) {
      const searchTerm = searchParam.trim();
      baseWhere.OR = [
        { title: { contains: searchTerm } },
        { description: { contains: searchTerm } },
        { location: { contains: searchTerm } },
        { neighborhood: { contains: searchTerm } },
        { city: { contains: searchTerm } },
        { state: { contains: searchTerm } },
      ];
    }

    let orderBy = { event_datetime: 'asc' };
    if (sort === 'datetime_desc') orderBy = { event_datetime: 'desc' };
    else if (sort === 'created_desc') orderBy = { created_at: 'desc' };
    else if (sort === 'popularity_desc') orderBy = { rsvp_count: 'desc' };

    const limitNum = req.query.limit ? Math.min(50, Math.max(1, parseInt(limit, 10) || 6)) : 500;

    const tpPage = Math.max(1, parseInt(topPicksPage, 10) || 1);
    const stPage = Math.max(1, parseInt(statePage, 10) || 1);
    const coPage = Math.max(1, parseInt(countryPage, 10) || 1);

    // Tier 1: Top Picks (Same City)
    const tpWhere = {
      ...baseWhere,
      city: { contains: userCity },
    };
    const tpTotal = await prisma.event.count({ where: tpWhere });
    const topPicks = await prisma.event.findMany({
      where: tpWhere,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy,
      skip: (tpPage - 1) * limitNum,
      take: limitNum,
    });

    // Tier 2: State Events (Same State & Country, Different City)
    const stWhere = {
      ...baseWhere,
      country: userCountry,
      state: userState,
      city: { not: userCity },
    };
    const stTotal = await prisma.event.count({ where: stWhere });
    const stateEvents = await prisma.event.findMany({
      where: stWhere,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy,
      skip: (stPage - 1) * limitNum,
      take: limitNum,
    });

    // Tier 3: Country Events (Same Country, Different State)
    const coWhere = {
      ...baseWhere,
      country: userCountry,
      state: { not: userState },
    };
    const coTotal = await prisma.event.count({ where: coWhere });
    const countryEvents = await prisma.event.findMany({
      where: coWhere,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy,
      skip: (coPage - 1) * limitNum,
      take: limitNum,
    });

    return res.status(200).json({
      userLocation: {
        country: userCountry,
        state: userState,
        city: userCity,
        isAuthenticated: isUserLoggedIn,
      },
      topPicks,
      stateEvents,
      countryEvents,
      pagination: {
        topPicks: {
          total: tpTotal,
          page: tpPage,
          limit: limitNum,
          totalPages: Math.ceil(tpTotal / limitNum) || 0,
          hasNextPage: tpPage * limitNum < tpTotal,
          hasPrevPage: tpPage > 1,
        },
        stateEvents: {
          total: stTotal,
          page: stPage,
          limit: limitNum,
          totalPages: Math.ceil(stTotal / limitNum) || 0,
          hasNextPage: stPage * limitNum < stTotal,
          hasPrevPage: stPage > 1,
        },
        countryEvents: {
          total: coTotal,
          page: coPage,
          limit: limitNum,
          totalPages: Math.ceil(coTotal / limitNum) || 0,
          hasNextPage: coPage * limitNum < coTotal,
          hasPrevPage: coPage > 1,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching tiered event feed:', error);
    return res.status(500).json({ error: 'Internal server error fetching tiered event feed.' });
  }
});


// GET /api/events/:id (Get single active non-soft-deleted event - Public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findFirst({
      where: { id, deleted_at: null },
      include: { creator: { select: { id: true, name: true, email: true } } },
    });

    if (!event || event.is_expired) {
      return res.status(404).json({ error: 'Event not found or expired.' });
    }

    return res.status(200).json(event);
  } catch (error) {
    console.error('Error fetching event by id:', error);
    return res.status(500).json({ error: 'Internal server error fetching event.' });
  }
});

// POST /api/events/:id/interested (Toggle "I'm Going" interest count - Auth required)
router.post('/:id/interested', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;

    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existingEvent || existingEvent.is_expired) {
      return res.status(404).json({ error: 'Event not found or has expired.' });
    }

    let updatedCount = existingEvent.interested_count || 0;
    if (action === 'remove') {
      updatedCount = Math.max(0, updatedCount - 1);
    } else {
      updatedCount = updatedCount + 1;
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        interested_count: updatedCount,
      },
    });

    return res.status(200).json({
      message: action === 'remove' ? 'Interest removed' : 'Interest recorded! 🙌',
      interested_count: updatedEvent.interested_count,
      is_interested: action !== 'remove',
    });
  } catch (error) {
    console.error('Error toggling interest:', error);
    return res.status(500).json({ error: 'Internal server error toggling interest.' });
  }
});

// POST /api/events/:id/create-razorpay-order (Create Razorpay Order for Paid Events)
router.post('/:id/create-razorpay-order', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const requestedQty = Math.max(1, parseInt(req.body.ticket_quantity || req.body.quantity, 10) || 1);

    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existingEvent || existingEvent.is_expired) {
      return res.status(404).json({ error: 'Event not found or expired.' });
    }

    const remainingTickets = Math.max(0, existingEvent.total_tickets - existingEvent.rsvp_count);
    if (remainingTickets <= 0) {
      return res.status(400).json({ error: 'Event is sold out. No more tickets available.' });
    }

    if (requestedQty > remainingTickets) {
      return res.status(400).json({ error: `Only ${remainingTickets} ticket(s) remaining for this event.` });
    }

    const ticketPrice = existingEvent.ticket_price || 0;
    const totalAmount = ticketPrice * requestedQty;

    if (totalAmount <= 0) {
      return res.status(200).json({
        is_free: true,
        total_amount: 0,
        message: 'This is a free event. No payment required.',
      });
    }

    const options = {
      amount: Math.round(totalAmount * 100), // amount in paise
      currency: 'INR',
      receipt: `rcpt_${id.slice(0, 8)}_${Date.now()}`,
      notes: {
        event_id: id,
        user_id: req.user.id,
        quantity: requestedQty,
      },
    };

    const order = await razorpayInstance.orders.create(options);

    return res.status(200).json({
      is_free: false,
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      key_id,
      ticket_price: ticketPrice,
      ticket_quantity: requestedQty,
      total_amount: totalAmount,
    });
  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    return res.status(500).json({ error: 'Failed to create payment order.' });
  }
});

// POST /api/events/:id/verify-razorpay-payment (Verify Razorpay Payment & Complete Registration)
router.post('/:id/verify-razorpay-payment', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      ticket_quantity,
    } = req.body;

    const requestedQty = Math.max(1, parseInt(ticket_quantity || req.body.quantity, 10) || 1);

    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
      include: { creator: { select: { id: true, name: true, email: true } } },
    });

    if (!existingEvent || existingEvent.is_expired) {
      return res.status(404).json({ error: 'Event not found or expired.' });
    }

    const remainingTickets = Math.max(0, existingEvent.total_tickets - existingEvent.rsvp_count);
    if (requestedQty > remainingTickets) {
      return res.status(400).json({ error: `Only ${remainingTickets} ticket(s) remaining for this event.` });
    }

    // Verify signature for paid events
    if (existingEvent.ticket_price > 0) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Payment parameters missing for verification.' });
      }

      const isValid = verifyRazorpaySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature);
      if (!isValid) {
        return res.status(400).json({ error: 'Payment verification failed. Signature mismatch.' });
      }
    }

    const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });
    const totalPaid = (existingEvent.ticket_price || 0) * requestedQty;
    const paymentIdStr = razorpay_payment_id || `FREE_${Date.now()}`;
    const orderIdStr = razorpay_order_id || `ORD_FREE_${Date.now()}`;
    const issuedTickets = [];

    for (let i = 0; i < requestedQty; i++) {
      const ticketNumber = existingEvent.rsvp_count + i + 1;
      const reg = await prisma.eventRegistration.create({
        data: {
          id: uuidv4(),
          event_id: id,
          user_id: req.user.id,
          user_name: dbUser?.name || 'Registered User',
          user_email: dbUser?.email || 'user@example.com',
          user_phone: dbUser?.phone || (req.body.phone && typeof req.body.phone === 'string' ? req.body.phone.trim() : null),
          ticket_number: ticketNumber,
          payment_id: paymentIdStr,
          order_id: orderIdStr,
          amount_paid: existingEvent.ticket_price || 0,
        },
      });
      issuedTickets.push(reg.ticket_number);
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        rsvp_count: { increment: requestedQty },
      },
      include: { creator: { select: { id: true, name: true, email: true } } },
    });

    // Asynchronously dispatch invoice email to customer
    if (dbUser?.email) {
      sendInvoiceEmail({
        userName: dbUser.name || 'Valued Customer',
        userEmail: dbUser.email,
        eventTitle: existingEvent.title,
        eventDate: existingEvent.event_datetime ? new Date(existingEvent.event_datetime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
        location: existingEvent.location,
        neighborhood: existingEvent.neighborhood,
        city: existingEvent.city,
        state: existingEvent.state,
        organizerName: existingEvent.creator?.name || 'Event Organizer',
        organizerEmail: existingEvent.creator?.email || 'contact@localevent.com',
        ticketNumbers: issuedTickets,
        quantity: requestedQty,
        ticketPrice: existingEvent.ticket_price || 0,
        totalAmountPaid: totalPaid,
        paymentId: paymentIdStr,
        orderId: orderIdStr,
        bookedAt: new Date().toISOString(),
      }).catch((e) => console.error('[EmailService] Async email dispatch error:', e.message));
    }

    return res.status(200).json({
      message: 'Payment verified and booking confirmed! 🎉',
      event: updatedEvent,
      ticket_numbers: issuedTickets,
      quantity_registered: requestedQty,
      payment_id: paymentIdStr,
      order_id: orderIdStr,
      total_amount_paid: totalPaid,
      booked_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error verifying Razorpay payment:', error);
    return res.status(500).json({ error: 'Internal server error verifying payment.' });
  }
});

// POST /api/events/:id/rsvp (Atomic RSVP Counter & Registration Record - Auth required)
router.post('/:id/rsvp', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const requestedQty = Math.max(1, parseInt(req.body.ticket_quantity || req.body.quantity, 10) || 1);

    if (requestedQty > 10) {
      return res.status(400).json({ error: 'Maximum 10 tickets can be reserved per booking.' });
    }

    // Check existence, soft deletion, and expiration
    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!existingEvent || existingEvent.is_expired) {
      return res.status(404).json({ error: 'Event not found or expired.' });
    }

    const remainingTickets = Math.max(0, existingEvent.total_tickets - existingEvent.rsvp_count);

    // Capacity check
    if (remainingTickets <= 0) {
      return res.status(400).json({ error: 'Event is sold out. No more tickets available.' });
    }

    if (requestedQty > remainingTickets) {
      return res.status(400).json({ error: `Only ${remainingTickets} ticket(s) remaining for this event.` });
    }

    const issuedTickets = [];

    if (req.user && req.user.id) {
      const dbUser = await prisma.user.findUnique({ where: { id: req.user.id } });

      for (let i = 0; i < requestedQty; i++) {
        const ticketNumber = existingEvent.rsvp_count + i + 1;
        const reg = await prisma.eventRegistration.create({
          data: {
            id: uuidv4(),
            event_id: id,
            user_id: req.user.id,
            user_name: dbUser?.name || 'Registered User',
            user_email: dbUser?.email || 'user@example.com',
            user_phone: dbUser?.phone || (req.body.phone && typeof req.body.phone === 'string' ? req.body.phone.trim() : null),
            ticket_number: ticketNumber,
          },
        });
        issuedTickets.push(reg.ticket_number);
      }
    }

    // Atomic single database update
    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        rsvp_count: {
          increment: requestedQty,
        },
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    // Asynchronously dispatch invoice email to customer for free RSVP
    if (req.user && req.user.id) {
      prisma.user.findUnique({ where: { id: req.user.id } }).then((dbUser) => {
        if (dbUser?.email) {
          sendInvoiceEmail({
            userName: dbUser.name || 'Valued Customer',
            userEmail: dbUser.email,
            eventTitle: existingEvent.title,
            eventDate: existingEvent.event_datetime ? new Date(existingEvent.event_datetime).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A',
            location: existingEvent.location,
            neighborhood: existingEvent.neighborhood,
            city: existingEvent.city,
            state: existingEvent.state,
            organizerName: existingEvent.creator?.name || 'Event Organizer',
            organizerEmail: existingEvent.creator?.email || 'contact@localevent.com',
            ticketNumbers: issuedTickets,
            quantity: requestedQty,
            ticketPrice: existingEvent.ticket_price || 0,
            totalAmountPaid: (existingEvent.ticket_price || 0) * requestedQty,
            paymentId: `FREE_RSVP_${Date.now()}`,
            orderId: `ORD_FREE_${Date.now()}`,
            bookedAt: new Date().toISOString(),
          }).catch((e) => console.error('[EmailService] Async email dispatch error:', e.message));
        }
      }).catch((err) => console.error('[EmailService] Error fetching user for email:', err.message));
    }

    return res.status(200).json({
      ...updatedEvent,
      ticket_number: issuedTickets[0] || updatedEvent.rsvp_count,
      ticket_numbers: issuedTickets,
      quantity_registered: requestedQty,
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Event not found.' });
    }
    console.error('Error updating RSVP count:', error);
    return res.status(500).json({ error: 'Internal server error processing RSVP.' });
  }
});

// DELETE /api/events/:id/rsvp (SOFT DELETE user booking & restore seat count - Auth required)
router.delete('/:id/rsvp', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    if (!existingEvent || existingEvent.is_expired) {
      return res.status(404).json({ error: 'Event not found or expired.' });
    }

    if (existingEvent.allow_cancellation === false) {
      return res.status(400).json({ error: 'Ticket cancellation is not allowed for this event.' });
    }

    const userRegistrations = await prisma.eventRegistration.findMany({
      where: {
        event_id: id,
        user_id: req.user.id,
        deleted_at: null,
      },
    });

    if (!userRegistrations || userRegistrations.length === 0) {
      return res.status(404).json({ error: 'No active booking found for this event.' });
    }

    const canceledQty = userRegistrations.length;
    const registrationIds = userRegistrations.map((r) => r.id);
    const now = new Date();

    // Professional Soft Delete: Mark registrations with deleted_at timestamp
    await prisma.eventRegistration.updateMany({
      where: { id: { in: registrationIds } },
      data: { deleted_at: now },
    });

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: {
        rsvp_count: {
          decrement: Math.min(existingEvent.rsvp_count, canceledQty),
        },
      },
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    });

    return res.status(200).json({
      ...updatedEvent,
      message: `Successfully cancelled ${canceledQty} ticket booking(s). Available capacity restored.`,
      canceled_tickets_count: canceledQty,
    });
  } catch (error) {
    console.error('Error cancelling RSVP:', error);
    return res.status(500).json({ error: 'Internal server error cancelling booking.' });
  }
});

// GET /api/events/:id/attendees (Get event attendee registrations - Owner Auth required)
router.get('/:id/attendees', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findFirst({
      where: { id, deleted_at: null },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. Only the event creator can view attendee registrations.' });
    }

    const attendees = await prisma.eventRegistration.findMany({
      where: { event_id: id, deleted_at: null },
      include: {
        user: {
          select: {
            phone: true,
          },
        },
      },
      orderBy: { ticket_number: 'asc' },
    });

    // Group registrations by unique attendee email
    const groupedMap = new Map();
    for (const reg of attendees) {
      const key = (reg.user_email || reg.user_id || reg.user_name || '').toLowerCase();
      const phoneNum = reg.user_phone || reg.user?.phone || null;

      if (!groupedMap.has(key)) {
        groupedMap.set(key, {
          user_id: reg.user_id,
          user_name: reg.user_name,
          user_email: reg.user_email,
          user_phone: phoneNum,
          ticket_count: 0,
          ticket_numbers: [],
          first_booked_at: reg.created_at,
        });
      }
      const item = groupedMap.get(key);
      if (!item.user_phone && phoneNum) {
        item.user_phone = phoneNum;
      }
      item.ticket_count += 1;
      item.ticket_numbers.push(reg.ticket_number);
    }

    const groupedAttendees = Array.from(groupedMap.values());

    return res.status(200).json({
      event_id: id,
      title: event.title,
      total_tickets: event.total_tickets,
      rsvp_count: event.rsvp_count,
      tickets_remaining: Math.max(0, event.total_tickets - event.rsvp_count),
      unique_attendees_count: groupedAttendees.length,
      grouped_attendees: groupedAttendees,
      attendees,
    });
  } catch (error) {
    console.error('Error fetching event attendees:', error);
    return res.status(500).json({ error: 'Internal server error fetching attendees.' });
  }
});

// PUT /api/events/:id (Update Event - Auth & Owner required)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      category,
      location,
      neighborhood,
      event_datetime,
      country,
      state,
      district,
      city,
      total_tickets,
    } = req.body;

    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Owner check
    if (existingEvent.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. You are not the owner of this event.' });
    }

    const updateData = {};

    if (total_tickets !== undefined) {
      const tNum = parseInt(total_tickets, 10);
      if (!isNaN(tNum) && tNum > 0) {
        updateData.total_tickets = tNum;
      }
    }

    if (req.body.allow_cancellation !== undefined) {
      updateData.allow_cancellation = Boolean(req.body.allow_cancellation);
    }

    if (title !== undefined) {
      if (!title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({ error: 'title cannot be empty.' });
      }
      updateData.title = title.trim();
    }

    if (description !== undefined) {
      if (!description || typeof description !== 'string' || !description.trim()) {
        return res.status(400).json({ error: 'description cannot be empty.' });
      }
      updateData.description = description.trim();
    }

    if (category !== undefined) {
      if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
      }
      updateData.category = category;
    }

    if (location !== undefined) {
      if (!location || typeof location !== 'string' || !location.trim()) {
        return res.status(400).json({ error: 'location cannot be empty.' });
      }
      updateData.location = location.trim();
    }

    if (neighborhood !== undefined) {
      if (!neighborhood || typeof neighborhood !== 'string' || !neighborhood.trim()) {
        return res.status(400).json({ error: 'neighborhood cannot be empty.' });
      }
      updateData.neighborhood = neighborhood.trim();
    }

    // Location updates
    const targetCountry = country !== undefined ? country : existingEvent.country;
    const targetState = state !== undefined ? state : existingEvent.state;
    const targetDistrict = district !== undefined ? district : existingEvent.district;
    const targetCity = city !== undefined ? city : existingEvent.city;

    if (
      country !== undefined ||
      state !== undefined ||
      district !== undefined ||
      city !== undefined
    ) {
      if (!targetCountry || !targetState || !targetDistrict || !targetCity) {
        return res.status(400).json({ error: 'Country, state, district, and city cannot be empty.' });
      }

      if (!isValidLocationCombo(targetCountry, targetState, targetDistrict, targetCity)) {
        return res.status(400).json({ error: 'Invalid location selection combination.' });
      }

      if (country !== undefined) updateData.country = country.trim();
      if (state !== undefined) updateData.state = state.trim();
      if (district !== undefined) updateData.district = district.trim();
      if (city !== undefined) updateData.city = city.trim();
    }

    if (event_datetime !== undefined) {
      if (!isValidFutureDate(event_datetime)) {
        return res.status(400).json({ error: 'event_datetime must be a valid future timestamp.' });
      }
      updateData.event_datetime = new Date(event_datetime);
    }

    if (req.body.image_url !== undefined) {
      if (req.body.image_url && typeof req.body.image_url === 'string' && req.body.image_url.trim()) {
        const cloudinaryUrl = await uploadToCloudinary(req.body.image_url.trim());
        updateData.image_url = cloudinaryUrl || req.body.image_url.trim();
      } else {
        updateData.image_url = null;
      }
    }

    const updatedEvent = await prisma.event.update({
      where: { id },
      data: updateData,
    });

    return res.status(200).json(updatedEvent);
  } catch (error) {
    console.error('Error updating event:', error);
    return res.status(500).json({ error: 'Internal server error updating event.' });
  }
});

// DELETE /api/events/:id (SOFT DELETE Event & associated Registrations - Auth & Owner required)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const existingEvent = await prisma.event.findFirst({
      where: { id, deleted_at: null },
    });

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Owner check
    if (existingEvent.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. You are not the owner of this event.' });
    }

    const now = new Date();

    // Professional Soft Delete: update deleted_at timestamps for event and its registrations
    await prisma.$transaction([
      prisma.eventRegistration.updateMany({
        where: { event_id: id, deleted_at: null },
        data: { deleted_at: now },
      }),
      prisma.event.update({
        where: { id },
        data: { deleted_at: now },
      }),
    ]);

    return res.status(204).send();
  } catch (error) {
    console.error('Error soft deleting event:', error);
    return res.status(500).json({ error: 'Internal server error deleting event.' });
  }
});

module.exports = router;
