const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runExpirationWorker() {
  const timestamp = new Date().toISOString();
  try {
    const expiredEvents = await prisma.event.findMany({
      where: {
        OR: [
          { event_datetime: { lt: new Date() } },
          { is_expired: true },
        ],
      },
      select: { id: true },
    });

    if (expiredEvents.length === 0) {
      console.log(`[ExpirationWorker] [${timestamp}] Scheduled check complete. Expired 0 event(s).`);
      return 0;
    }

    const expiredIds = expiredEvents.map(e => e.id);

    // Delete associated registrations first
    await prisma.eventRegistration.deleteMany({
      where: {
        event_id: { in: expiredIds },
      },
    });

    // Permanently delete completed past events from database
    const deleteResult = await prisma.event.deleteMany({
      where: {
        id: { in: expiredIds },
      },
    });

    console.log(`[ExpirationWorker] [${timestamp}] Scheduled check complete. Deleted ${deleteResult.count} completed past event(s).`);
    return deleteResult.count;
  } catch (error) {
    console.error(`[ExpirationWorker] [${timestamp}] Error running expiration worker:`, error);
    throw error;
  }
}

function initExpirationWorker() {
  console.log('[ExpirationWorker] Initializing scheduled cron job (hourly: 0 * * * *)...');
  
  // Run on startup once
  runExpirationWorker().catch(err => {
    console.error('[ExpirationWorker] Initial startup run failed:', err);
  });

  // Schedule to run every hour
  cron.schedule('0 * * * *', () => {
    runExpirationWorker().catch(err => {
      console.error('[ExpirationWorker] Scheduled execution failed:', err);
    });
  });
}

module.exports = {
  runExpirationWorker,
  initExpirationWorker,
};
