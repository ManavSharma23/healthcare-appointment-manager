/**
 * reset-data.mjs
 * Deletes ALL clinical data (appointments, notes, notifications, etc.)
 * while preserving doctors (User + DoctorProfile + DoctorLeave).
 *
 * Run: node scripts/reset-data.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('\n🔴  PulseCare Data Reset — preserving doctor records...\n');

  const calEvents     = await prisma.calendarEvent.deleteMany();
  console.log(`   ✅  CalendarEvent       — deleted ${calEvents.count}`);

  const medReminders  = await prisma.medicationReminder.deleteMany();
  console.log(`   ✅  MedicationReminder  — deleted ${medReminders.count}`);

  const visitNotes    = await prisma.visitNote.deleteMany();
  console.log(`   ✅  VisitNote           — deleted ${visitNotes.count}`);

  const symptomForms  = await prisma.symptomForm.deleteMany();
  console.log(`   ✅  SymptomForm         — deleted ${symptomForms.count}`);

  const notifs        = await prisma.notification.deleteMany();
  console.log(`   ✅  Notification        — deleted ${notifs.count}`);

  const appointments  = await prisma.appointment.deleteMany();
  console.log(`   ✅  Appointment         — deleted ${appointments.count}`);

  const waitlist      = await prisma.waitlistEntry.deleteMany();
  console.log(`   ✅  WaitlistEntry       — deleted ${waitlist.count}`);

  const calTokens     = await prisma.calendarToken.deleteMany();
  console.log(`   ✅  CalendarToken       — deleted ${calTokens.count}`);

  const auditLogs     = await prisma.auditLog.deleteMany();
  console.log(`   ✅  AuditLog            — deleted ${auditLogs.count}`);

  const removedUsers = await prisma.user.deleteMany({
    where: { role: { in: ['patient', 'admin'] } }
  });
  console.log(`   ✅  Non-doctor Users    — deleted ${removedUsers.count} (patients + admins)\n`);

  const doctors = await prisma.user.findMany({
    where: { role: 'doctor' },
    select: { name: true, email: true, doctor_profile: { select: { specialisation: true } } }
  });
  console.log(`🩺  ${doctors.length} doctor record(s) preserved:`);
  doctors.forEach(d => {
    console.log(`   • ${d.name} — ${d.doctor_profile?.specialisation ?? 'No profile'} — ${d.email}`);
  });

  console.log('\n🟢  Reset complete. Re-register via the app login screen.\n');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
