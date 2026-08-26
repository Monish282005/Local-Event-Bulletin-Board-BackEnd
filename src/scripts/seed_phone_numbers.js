const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function seedPhoneNumbers() {
  console.log('--- SEEDING SAMPLE PHONE NUMBERS FOR EXISTING USERS ---\n');

  const users = await prisma.user.findMany();
  for (const user of users) {
    let phoneNum = user.phone;
    if (!phoneNum) {
      if (user.email.includes('san')) {
        phoneNum = '+91 98765 43210';
      } else if (user.email.includes('nk')) {
        phoneNum = '+91 91234 56789';
      } else if (user.email.includes('monish')) {
        phoneNum = '+91 99887 76655';
      } else {
        phoneNum = `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`;
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { phone: phoneNum },
      });
      console.log(`✅ Updated ${user.name} (${user.email}) -> Phone: ${phoneNum}`);
    } else {
      console.log(`ℹ️ ${user.name} (${user.email}) already has phone: ${user.phone}`);
    }
  }

  // Also update existing registrations
  const regs = await prisma.eventRegistration.findMany({
    include: { user: true },
  });

  for (const reg of regs) {
    if (!reg.user_phone && reg.user?.phone) {
      await prisma.eventRegistration.update({
        where: { id: reg.id },
        data: { user_phone: reg.user.phone },
      });
    }
  }

  console.log('\n🎉 ALL EXISTING USERS & REGISTRATIONS POPULATED WITH PHONE NUMBERS!');
  await prisma.$disconnect();
}

seedPhoneNumbers().catch((err) => {
  console.error(err);
  process.exit(1);
});
