const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupDb() {
  console.log('=== STARTING DATABASE CLEANUP OF TEST & DUPLICATE DATA ===\n');

  // 1. Delete Event Registrations for test events or test users
  const deletedRegistrations = await prisma.eventRegistration.deleteMany({
    where: {
      OR: [
        { user_email: { contains: 'example.com' } },
        { user_name: { contains: 'Test' } },
        { user_name: { contains: 'User' } },
        { user_name: { contains: 'Alice' } },
        { user_name: { contains: 'Bob' } },
        { user_name: { contains: 'Sarah' } },
        { user_name: { contains: 'David' } },
        { user_name: { contains: 'Holder' } },
      ],
    },
  });
  console.log(`[1/4] Cleaned up ${deletedRegistrations.count} test event registrations.`);

  // 2. Delete Test Events created by test scripts
  const deletedTestEvents = await prisma.event.deleteMany({
    where: {
      OR: [
        { title: { contains: 'Valid Location Event' } },
        { title: { contains: 'Invalid Combo Event' } },
        { title: { contains: 'Expired Past Concert' } },
        { title: { contains: 'Bengaluru Tech Meetup' } },
        { title: { contains: 'Mysuru Palace Cultural Fest' } },
        { title: { contains: 'Mumbai Food Carnival' } },
        { title: { contains: 'User A Event' } },
        { title: { contains: 'Limited Capacity Workshop' } },
        { title: { contains: 'Family Music Fest' } },
        { title: { contains: 'Grand Concert' } },
        { title: { contains: 'Test Event' } },
        { title: { contains: 'Test' } },
      ],
    },
  });
  console.log(`[2/4] Cleaned up ${deletedTestEvents.count} test events.`);

  // 3. Delete Duplicate Events (keeping the latest unique 1 for each title+neighborhood)
  const remainingEvents = await prisma.event.findMany({
    orderBy: { created_at: 'desc' },
  });

  const seenKeys = new Set();
  const duplicateIdsToDelete = [];

  for (const ev of remainingEvents) {
    const key = `${ev.title.trim().toLowerCase()}|${ev.city.trim().toLowerCase()}|${ev.neighborhood.trim().toLowerCase()}`;
    if (seenKeys.has(key)) {
      duplicateIdsToDelete.push(ev.id);
    } else {
      seenKeys.add(key);
    }
  }

  if (duplicateIdsToDelete.length > 0) {
    const deletedDups = await prisma.event.deleteMany({
      where: {
        id: { in: duplicateIdsToDelete },
      },
    });
    console.log(`[3/4] Cleaned up ${deletedDups.count} duplicate event listings.`);
  } else {
    console.log('[3/4] No remaining duplicate events found.');
  }

  // 4. Delete Test Users created by automated test scripts
  const deletedTestUsers = await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { contains: 'example.com' } },
        { email: { contains: 'test' } },
        { name: { contains: 'Test' } },
        { name: { contains: 'User A' } },
        { name: { contains: 'User B' } },
        { name: { contains: 'Feed User' } },
        { name: { contains: 'Event Organizer' } },
        { name: { contains: 'Alice Johnson' } },
        { name: { contains: 'Bob Smith' } },
        { name: { contains: 'Sarah Organizer' } },
        { name: { contains: 'David Buyer' } },
        { name: { contains: 'Bookings Host' } },
        { name: { contains: 'Ticket Holder' } },
      ],
    },
  });
  console.log(`[4/4] Cleaned up ${deletedTestUsers.count} test users.\n`);

  // Final Summary
  const finalUsers = await prisma.user.count();
  const finalEvents = await prisma.event.count();
  const finalRegs = await prisma.eventRegistration.count();

  console.log('=== CLEANUP COMPLETE ===');
  console.log(`Final Database State: Users=${finalUsers}, Events=${finalEvents}, Registrations=${finalRegs}`);

  await prisma.$disconnect();
}

cleanupDb();
