const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { PrismaClient } = require('@prisma/client');
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');
const authenticate = require('../middleware/auth');
const { isValidLocationCombo } = require('../utils/locationData');

const router = express.Router();
const prisma = new PrismaClient();

// Helper to sanitize user object (strip password_hash)
function sanitizeUser(user) {
  const { password_hash, ...sanitized } = user;
  return sanitized;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, country, state, district, city } = req.body;

    // Basic fields validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Name is required.' });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    // Location fields validation
    if (
      !country || typeof country !== 'string' || !country.trim() ||
      !state || typeof state !== 'string' || !state.trim() ||
      !district || typeof district !== 'string' || !district.trim() ||
      !city || typeof city !== 'string' || !city.trim()
    ) {
      return res.status(400).json({ error: 'Country, state, district, and city are required.' });
    }

    if (!isValidLocationCombo(country, state, district, city)) {
      return res.status(400).json({ error: 'Invalid location selection combination.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Check duplicate email
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return res.status(409).json({ error: 'An account with this email address already exists.' });
    }

    // Hash password and generate UUID
    const hashedPassword = await hashPassword(password);
    const userId = uuidv4();

    // Create user in DB with location data
    const newUser = await prisma.user.create({
      data: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        password_hash: hashedPassword,
        country: country.trim(),
        state: state.trim(),
        district: district.trim(),
        city: city.trim(),
      },
    });


    const token = generateToken(newUser);
    const sanitizedUser = sanitizeUser(newUser);

    return res.status(201).json({
      message: 'User registered successfully',
      user: sanitizedUser,
      token,
    });
  } catch (error) {
    console.error('Error during signup:', error);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Generic error message to prevent account enumeration
    const genericAuthError = 'Invalid email or password.';

    if (!user) {
      return res.status(401).json({ error: genericAuthError });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: genericAuthError });
    }

    const token = generateToken(user);
    const sanitizedUser = sanitizeUser(user);

    return res.status(200).json({
      message: 'Login successful',
      user: sanitizedUser,
      token,
    });
  } catch (error) {
    console.error('Error during login:', error);
    return res.status(500).json({ error: 'Internal server error during authentication.' });
  }
});

// GET /api/auth/me (Protected Route Test)
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    return res.status(200).json({
      user: sanitizeUser(user),
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
});

module.exports = router;
