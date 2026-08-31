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

function isValidPhoneNumber(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  const phoneCharRegex = /^\+?[0-9\s\-()]{10,20}$/;
  if (!phoneCharRegex.test(trimmed)) return false;
  const digitsOnly = trimmed.replace(/\D/g, '');
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password, phone, country, state, district, city } = req.body;

    // Basic fields validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Name is required (minimum 2 characters).' });
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required.' });
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    if (phone && !isValidPhoneNumber(phone)) {
      return res.status(400).json({ error: 'Please enter a valid 10-digit to 15-digit mobile phone number.' });
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

    const phoneStr = phone && typeof phone === 'string' && phone.trim() ? phone.trim() : null;

    // Create user in DB with location & phone data
    const newUser = await prisma.user.create({
      data: {
        id: userId,
        name: name.trim(),
        email: normalizedEmail,
        password_hash: hashedPassword,
        phone: phoneStr,
        country: country.trim(),
        state: state.trim(),
        district: district.trim(),
        city: city.trim(),
      },
    });

    const token = generateToken(newUser);
    const sanitizedUser = sanitizeUser(newUser);

    return res.status(201).json({
      message: 'User created successfully',
      user: sanitizedUser,
      token,
    });
  } catch (error) {
    console.error('Error during signup:', error);
    return res.status(500).json({ error: 'Internal server error during user creation.' });
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

    if (!user) {
      return res.status(404).json({
        error: 'No account found with this email address. Please sign up to create an account.',
        notFound: true,
      });
    }

    if (!user.password_hash) {
      return res.status(400).json({
        error: 'This account was registered using Google Sign-In. Please click "Continue with Google".',
      });
    }

    // Verify password
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
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

// GET /api/auth/me (Get Profile)
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

// PUT /api/auth/me (Update User Profile & Phone Number)
router.put('/me', authenticate, async (req, res) => {
  try {
    const { name, phone, city, state, district, country } = req.body;

    const updateData = {};
    if (name && typeof name === 'string' && name.trim()) updateData.name = name.trim();
    if (phone !== undefined && phone !== null && phone !== '') {
      if (!isValidPhoneNumber(phone)) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit to 15-digit mobile phone number.' });
      }
      updateData.phone = phone.trim();
    }
    if (city && typeof city === 'string' && city.trim()) updateData.city = city.trim();
    if (state && typeof state === 'string' && state.trim()) updateData.state = state.trim();
    if (district && typeof district === 'string' && district.trim()) updateData.district = district.trim();
    if (country && typeof country === 'string' && country.trim()) updateData.country = country.trim();

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
    });

    return res.status(200).json({
      message: 'Profile updated successfully',
      user: sanitizeUser(updatedUser),
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    return res.status(500).json({ error: 'Internal server error updating profile.' });
  }
});

// POST /api/auth/google (Google OAuth Authentication & Provisioning)
router.post('/google', async (req, res) => {
  try {
    const { credential, access_token, email, name, google_id, phone, city, state, district, country } = req.body;

    let targetEmail = email;
    let targetName = name;
    let targetGoogleId = google_id;

    // Fetch userinfo using access_token if email not provided directly
    if (access_token && !targetEmail) {
      try {
        const axios = require('axios');
        const googleRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${access_token}` },
        });
        if (googleRes.data && googleRes.data.email) {
          targetEmail = googleRes.data.email;
          targetName = googleRes.data.name || googleRes.data.given_name || 'Google User';
          targetGoogleId = googleRes.data.sub;
        }
      } catch (axiosErr) {
        console.warn('Failed to fetch Google userinfo on backend:', axiosErr.message);
      }
    }

    // Decode Google ID Token if passed as JWT credential string
    if (credential && !targetEmail) {
      try {
        const parts = credential.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          targetEmail = payload.email;
          targetName = payload.name || payload.given_name || 'Google User';
          targetGoogleId = payload.sub;
        }
      } catch (tokenErr) {
        console.warn('Failed to parse Google ID token credential:', tokenErr);
      }
    }

    if (!targetEmail || typeof targetEmail !== 'string' || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'Valid Google user email is required.' });
    }

    const normalizedEmail = targetEmail.trim().toLowerCase();

    // Check if user exists by email or google_id
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          ...(targetGoogleId ? [{ google_id: targetGoogleId }] : []),
        ],
      },
    });

    if (user) {
      if (!user.google_id && targetGoogleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { google_id: targetGoogleId },
        });
      }
    } else {
      // Create new user account automatically with default home location
      const userCity = city && typeof city === 'string' && city.trim() ? city.trim() : 'Bengaluru';
      const userState = state && typeof state === 'string' && state.trim() ? state.trim() : 'Karnataka';
      const userDistrict = district && typeof district === 'string' && district.trim() ? district.trim() : 'Bengaluru Urban';
      const userCountry = country && typeof country === 'string' && country.trim() ? country.trim() : 'India';
      const userPhone = phone && typeof phone === 'string' && phone.trim() ? phone.trim() : null;

      user = await prisma.user.create({
        data: {
          id: uuidv4(),
          name: targetName ? targetName.trim() : 'Google User',
          email: normalizedEmail,
          google_id: targetGoogleId || `google_${uuidv4()}`,
          phone: userPhone,
          country: userCountry,
          state: userState,
          district: userDistrict,
          city: userCity,
        },
      });
    }

    const token = generateToken(user);
    const sanitizedUser = sanitizeUser(user);

    return res.status(200).json({
      message: 'Google Sign-In successful',
      user: sanitizedUser,
      token,
    });
  } catch (error) {
    console.error('Error during Google authentication:', error);
    return res.status(500).json({ error: 'Internal server error during Google Sign-In.' });
  }
});

module.exports = router;
