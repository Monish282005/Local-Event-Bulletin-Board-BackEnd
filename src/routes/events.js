const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const authenticate = require('../middleware/auth');
const { optionalAuthenticate } = require('../middleware/auth');
const { isValidLocationCombo } = require('../utils/locationData');


const router = express.Router();
const prisma = new PrismaClient();

const VALID_CATEGORIES = ['sports', 'music', 'food', 'yard_sale', 'other'];

// Helper to validate date string and ensure it's in the future
function isValidFutureDate(dateString) {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return false;
  return date.getTime() > Date.now();
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

    // Required base fields check
    if (!title || !description || !category || !location || !neighborhood || !event_datetime) {
      return res.status(400).json({
        error: 'Missing required fields. title, description, category, location, neighborhood, and event_datetime are required.'
      });
    }

    // Required structured location fields check
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
    const allowCancellationBool = req.body.allow_cancellation !== undefined ? Boolean(req.body.allow_cancellation) : true;

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
        allow_cancellation: allowCancellationBool,
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


// GET /api/events/my-events (List events created by logged-in user - Auth required)
router.get('/my-events', authenticate, async (req, res) => {
  try {
    const { page, limit } = req.query;

    const whereClause = {
      created_by: req.user.id,
      is_expired: false,
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


// GET /api/events/my-bookings (List event registrations for logged-in user - Auth required)
router.get('/my-bookings', authenticate, async (req, res) => {
  try {
    const registrations = await prisma.eventRegistration.findMany({
      where: {
        user_id: req.user.id,
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
      if (!reg.event || reg.event.is_expired) continue;

      const eventId = reg.event.id;
      if (!groupedMap.has(eventId)) {
        groupedMap.set(eventId, {
          event: reg.event,
          total_user_tickets: 0,
          ticket_numbers: [],
          booked_at: reg.created_at,
        });
      }

      const item = groupedMap.get(eventId);
      item.total_user_tickets += 1;
      item.ticket_numbers.push(reg.ticket_number);
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


// GET /api/events (List non-expired events - Public for search & filter)
router.get('/', async (req, res) => {
  try {
    const { neighborhood, category, page, limit, paginate } = req.query;

    const whereClause = {
      is_expired: false,
    };

    const searchParam = req.query.neighborhood || req.query.search || req.query.query;
    if (searchParam && typeof searchParam === 'string' && searchParam.trim()) {
      const searchTerm = searchParam.trim();
      whereClause.OR = [
        { city: { contains: searchTerm } },
        { district: { contains: searchTerm } },
        { neighborhood: { contains: searchTerm } },
        { state: { contains: searchTerm } },
        { title: { contains: searchTerm } },
        { location: { contains: searchTerm } },
      ];
    }

    if (category && typeof category === 'string' && category.trim()) {
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

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10) || 9));
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

    if (page || limit || paginate === 'true') {
      return res.status(200).json({ events, pagination });
    }

    // Default array return with pagination header for backward compatibility
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
    } else {
      if (req.query.country && typeof req.query.country === 'string') userCountry = req.query.country.trim();
      if (req.query.state && typeof req.query.state === 'string') userState = req.query.state.trim();
      if (req.query.city && typeof req.query.city === 'string') userCity = req.query.city.trim();
    }

    const { category, topPicksPage, statePage, countryPage, limit } = req.query;
    const categoryFilter = (category && typeof category === 'string' && VALID_CATEGORIES.includes(category.trim()))
      ? category.trim()
      : null;

    const baseWhere = {
      is_expired: false,
      ...(categoryFilter ? { category: categoryFilter } : {}),
    };

    const limitNum = req.query.limit ? Math.min(50, Math.max(1, parseInt(limit, 10) || 6)) : 500;

    const tpPage = Math.max(1, parseInt(topPicksPage, 10) || 1);
    const stPage = Math.max(1, parseInt(statePage, 10) || 1);
    const coPage = Math.max(1, parseInt(countryPage, 10) || 1);

    // Tier 1: Top Picks (Same City, State, Country)
    const tpWhere = {
      ...baseWhere,
      country: userCountry,
      state: userState,
      city: userCity,
    };
    const tpTotal = await prisma.event.count({ where: tpWhere });
    const topPicks = await prisma.event.findMany({
      where: tpWhere,
      include: { creator: { select: { id: true, name: true, email: true } } },
      orderBy: { event_datetime: 'asc' },
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
      orderBy: { event_datetime: 'asc' },
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
      orderBy: { event_datetime: 'asc' },
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


// GET /api/events/:id (Get single non-expired event - Public)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const event = await prisma.event.findUnique({
      where: { id },
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

// POST /api/events/:id/rsvp (Atomic RSVP Counter & Registration Record - Auth required)
router.post('/:id/rsvp', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const requestedQty = Math.max(1, parseInt(req.body.ticket_quantity || req.body.quantity, 10) || 1);

    if (requestedQty > 10) {
      return res.status(400).json({ error: 'Maximum 10 tickets can be reserved per booking.' });
    }

    // Check existence and expiration first
    const existingEvent = await prisma.event.findUnique({
      where: { id },
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
            ticket_number: ticketNumber,
          },
        });
        issuedTickets.push(reg.ticket_number);
      }
    }

    // Atomic single database update using row-level locking
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

// DELETE /api/events/:id/rsvp (Cancel user booking & restore seat count - Auth required)
router.delete('/:id/rsvp', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const existingEvent = await prisma.event.findUnique({
      where: { id },
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
      },
    });

    if (!userRegistrations || userRegistrations.length === 0) {
      return res.status(404).json({ error: 'No active booking found for this event.' });
    }

    const canceledQty = userRegistrations.length;

    await prisma.eventRegistration.deleteMany({
      where: {
        event_id: id,
        user_id: req.user.id,
      },
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

    const event = await prisma.event.findUnique({
      where: { id },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    if (event.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. Only the event creator can view attendee registrations.' });
    }

    const attendees = await prisma.eventRegistration.findMany({
      where: { event_id: id },
      orderBy: { ticket_number: 'asc' },
    });

    return res.status(200).json({
      event_id: id,
      title: event.title,
      total_tickets: event.total_tickets,
      rsvp_count: event.rsvp_count,
      tickets_remaining: Math.max(0, event.total_tickets - event.rsvp_count),
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

    const existingEvent = await prisma.event.findUnique({
      where: { id },
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

// DELETE /api/events/:id (Delete Event - Auth & Owner required)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;

    const existingEvent = await prisma.event.findUnique({
      where: { id },
    });

    if (!existingEvent) {
      return res.status(404).json({ error: 'Event not found.' });
    }

    // Owner check
    if (existingEvent.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden. You are not the owner of this event.' });
    }

    await prisma.event.delete({
      where: { id },
    });

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting event:', error);
    return res.status(500).json({ error: 'Internal server error deleting event.' });
  }
});

module.exports = router;
