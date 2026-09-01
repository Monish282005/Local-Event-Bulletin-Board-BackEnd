const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const eventsRouter = require('./routes/events');
const { initExpirationWorker } = require('./workers/expirationWorker');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// Configure CORS for local and production domains
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CLIENT_ORIGIN === '*' || origin === CLIENT_ORIGIN || origin.includes('localhost') || origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com') || origin.endsWith('.run.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Register routes
app.use('/', healthRouter);
app.use('/api', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/events', eventsRouter);

// Initialize expiration cron worker
initExpirationWorker();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`CORS allowed origin: ${CLIENT_ORIGIN}`);
});
