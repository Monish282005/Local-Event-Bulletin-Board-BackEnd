const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function inspectDb() {
  console.log('--- DB USERS & EVENTS DUP INSPECTION ---');
  
  const users = await prisma.user.findMany();
  console.log(`Total Users in DB: ${users.length}`);
  
  const emailCounts = {};
  users.forEach(u => {
    emailCounts[u.email] = (emailCounts[u.email] || 0) + 1;
  });
  const dupEmails = Object.entries(emailCounts).filter(([_, count]) => count > 1);
  console.log('Duplicate User Emails:', dupEmails);

  const events = await prisma.event.findMany();
  console.log(`Total Events in DB: ${events.length}`);

  const titleCounts = {};
  events.forEach(e => {
    const key = `${e.title}|${e.city}|${e.neighborhood}`;
    titleCounts[key] = (titleCounts[key] || 0) + 1;
  });
  const dupTitles = Object.entries(titleCounts).filter(([_, count]) => count > 1);
  console.log('Duplicate Event Titles (title|city|neighborhood):', dupTitles);

  await prisma.$disconnect();
}

inspectDb();
