# Local Event Bulletin Board — Backend API Server

A robust, RESTful backend server built with **Node.js**, **Express**, **MySQL**, and **Prisma ORM**. Powers user authentication, structured location validation, hierarchical tiered event feeds, ticket reservations, Cloudinary image uploads, and automated expiration workers.

---

## 🌟 Key Features

### 1. 🔑 Authentication & Authorization
- **JWT-Based Authentication**: Secure password hashing with `bcryptjs` and stateless JWT tokens.
- **Location-Aware User Accounts**: Captures `country`, `state`, `district`, and `city` upon registration.
- **Route Protection Middleware**: `authenticate` and `authorizeOwner` middlewares enforce route security.

### 2. 📍 Structured Location & Dual-Geocoding Database Engine
- **Hierarchical Location Columns**: `Event` and `User` models feature indexed `country`, `state`, `district`, and `city` columns.
- **Coordinate Persistence**: Stores `latitude` and `longitude` (`Float?`) for exact pin accuracy on Leaflet satellite maps.
- **Normalized Location Engine**: Capitalizes and standardizes location fields to ensure zero query mismatch.

### 3. 📊 Hierarchical Tiered Event Feed API (`GET /api/events/feed`)
- **Three-Tier Mutually Exclusive Feed**:
  1. `topPicks`: Active events occurring in the user's selected `city`.
  2. `stateEvents`: Active events in the user's `state` (excluding city events).
  3. `countryEvents`: Active events in the user's `country` (excluding state & city events).
- **Index-Accelerated MySQL Queries**: Queries leverage indexes on `city`, `state`, and composite `(country, state, city)`.

### 4. 🎟️ Ticket Reservations & Concurrency Control
- **Atomic Transactions**: Utilizes Prisma `$transaction` blocks to prevent race conditions during ticket booking.
- **Seat Availability Tracking**: Ensures `rsvp_count` never exceeds `total_tickets`.
- **Unique Pass Generation**: Generates unique ticket numbers (`TICK-XXXXXXXX`) for each registration.

### 5. 🖼️ Cloudinary Image Upload
- **Cloud Storage Integration**: Automatically uploads base64 and web image URLs to Cloudinary CDN with fallback handling.

### 6. ⏱️ Automated Event Expiration Worker
- **Scheduled Cleanup Job**: Periodically soft-deletes completed past events by setting `deleted_at = NOW()` and `is_expired = true`.
- **Clean Exclusion**: Excluded events automatically vanish from live feeds without data loss.

---

## 📁 Directory Structure

```
server/
├── prisma/
│   └── schema.prisma              # Prisma schema definition (MySQL)
├── src/
│   ├── config/
│   │   └── cloudinary.js          # Cloudinary CDN configuration
│   ├── middleware/
│   │   ├── auth.js                # JWT authentication middleware
│   │   └── validateLocation.js    # Location combination validator
│   ├── routes/
│   │   ├── auth.js                # Auth endpoints (signup, login, me)
│   │   ├── events.js              # Event CRUD, feed, RSVP, interested, geocoding
│   │   ├── locations.js           # Country, state, district, city data APIs
│   │   └── registrations.js       # User ticket pass & booking endpoints
│   ├── scripts/
│   │   ├── run_all_tests.js       # Master backend test runner
│   │   ├── verify_all_modules_15_to_18.js # Comprehensive 4-module test suite
│   │   ├── verify_module15_schema.js      # DB schema & index verification
│   │   ├── verify_module16_signup.js      # Location signup verification
│   │   ├── verify_module17_post_event.js  # Event creation verification
│   │   └── verify_module18_feed.js        # Hierarchical feed verification
│   ├── utils/
│   │   ├── emailService.js        # EmailJS server-side integration helper
│   │   └── expirationWorker.js    # Cron job worker for soft-deleting past events
│   └── server.js                  # Express app entry point
├── .env                           # Environment variables
└── package.json                   # Dependencies & npm scripts
```

---

## 🗄️ Database Schema (`prisma/schema.prisma`)

```prisma
model User {
  id            String   @id @default(uuid())
  name          String
  email         String   @unique
  password_hash String
  country       String   @default("India")
  state         String   @default("Karnataka")
  district      String   @default("Bengaluru Urban")
  city          String   @default("Bengaluru")
  created_at    DateTime @default(now())

  events        Event[]
  registrations EventRegistration[]
  interests     UserInterest[]
}

model Event {
  id                 String    @id @default(uuid())
  title              String
  description        String    @db.Text
  category           String
  location           String
  neighborhood       String
  country            String    @default("India")
  state              String    @default("Karnataka")
  district           String    @default("Bengaluru Urban")
  city               String    @default("Bengaluru")
  latitude           Float?
  longitude          Float?
  event_datetime     DateTime
  total_tickets      Int       @default(50)
  ticket_price       Float     @default(0.0)
  allow_cancellation Boolean   @default(true)
  rsvp_count         Int       @default(0)
  interested_count   Int       @default(0)
  image_url          String?   @db.Text
  is_expired         Boolean   @default(false)
  created_at         DateTime  @default(now())
  deleted_at         DateTime?

  created_by         String
  creator            User      @relation(fields: [created_by], references: [id])
  registrations      EventRegistration[]
  interests          UserInterest[]
}
```

---

## 🛠️ Environment Variables (`server/.env`)

Create a `.env` file in the `server/` root directory:

```env
# Database Connection String (MySQL)
DATABASE_URL="mysql://root:root@localhost:3306/event"

# Express Port
PORT=5000

# Secret Key for Signing JWT Tokens
JWT_SECRET="super-secret-jwt-key-for-local-event-bulletin-board"

# Allowed CORS Origin (Frontend URL)
CLIENT_ORIGIN="http://localhost:5173"

# Cloudinary CDN Credentials (Optional)
CLOUDINARY_CLOUD_NAME="your-cloud-name"
CLOUDINARY_API_KEY="your-api-key"
CLOUDINARY_API_SECRET="your-api-secret"

# EmailJS Service Credentials
EMAILJS_SERVICE_ID="service_dtdc1i7"
EMAILJS_TEMPLATE_ID="template_o68loll"
EMAILJS_PUBLIC_KEY="XKPihqhW-GdZF_BwL"
EMAILJS_PRIVATE_KEY="E7eOn3uAoXl_dLBJRfB5q"
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **MySQL**: v8.0 or higher running locally on port 3306

### Installation & Run

1. Navigate to the `server` folder:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Push Prisma schema to MySQL database:
   ```bash
   npx prisma db push
   ```

4. Generate Prisma Client SDK:
   ```bash
   npx prisma generate
   ```

5. Start Express API server:
   ```bash
   npm run dev
   ```

---

## 🧪 Automated Testing & Verification Suite

Run the full master verification suite to test all 18 modules and API endpoints:

```bash
# Run Master Suite (Modules 15, 16, 17, 18 + Base Suite)
node src/scripts/verify_all_modules_15_to_18.js

# Run Base Automated Test Suite (12 Core Tests)
node src/scripts/run_all_tests.js
```
