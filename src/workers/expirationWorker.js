const cron = require('node-cron');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runExpirationWorker() {
  const timestamp = new Date().toISOString();
  try {
    const now = new Date();
    const expiredEvents = await prisma.event.findMany({
      where: {
        event_datetime: { lt: now },
        deleted_at: null,
      },
      select: { id: true },
    });

    if (expiredEvents.length === 0) {
      console.log(`[ExpirationWorker] [${timestamp}] Scheduled check complete. Expired 0 event(s).`);
      return 0;
    }

    const expiredIds = expiredEvents.map(e => e.id);

    // Soft delete associated registrations first
    await prisma.eventRegistration.updateMany({
      where: {
        event_id: { in: expiredIds },
        deleted_at: null,
      },
      data: {
        deleted_at: now,
      },
    });

    // Soft delete completed past events
    const updateResult = await prisma.event.updateMany({
      where: {
        id: { in: expiredIds },
        deleted_at: null,
      },
      data: {
        deleted_at: now,
        is_expired: true,
      },
    });

    console.log(`[ExpirationWorker] [${timestamp}] Scheduled check complete. Soft-deleted ${updateResult.count} completed past event(s).`);
    return updateResult.count;
  } catch (error) {
    console.error(`[ExpirationWorker] [${timestamp}] Error running expiration worker:`, error);
    throw error;
  }
}

function initExpirationWorker() {
  console.log('[ExpirationWorker] Initializing scheduled cron job (hourly: 0 * * * *)...');
  
  // Run on startup once
  runExpirationWorker().catch(err => {
    console.error('[ExpirationWorker] Error during initial startup run:', err);
  });

  // Schedule cron job to run at minute 0 of every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await runExpirationWorker();
    } catch (err) {
      console.error('[ExpirationWorker] Cron job execution failed:', err);
    }
  });
}

module.exports = {
  runExpirationWorker,
  initExpirationWorker,
};
