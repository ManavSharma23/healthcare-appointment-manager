import { prisma } from './db/prisma';
import { hashPassword } from './utils/auth';

export async function seedDatabase() {
  // Ensure DB-level Partial Unique Index exists: WHERE status IN ('held', 'confirmed')
  try {
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_doc_slot 
      ON "Appointment" (doctor_id, slot_start) 
      WHERE status IN ('held', 'confirmed');
    `);
  } catch (idxErr) {
    console.warn('[DB Partial Index Init]:', idxErr);
  }
  const existingAdmin = await prisma.user.findFirst({ where: { role: 'admin' } });
  if (existingAdmin) {
    console.log('Database already contains admin account. Skipping seed.');
    return;
  }

  const passHash = await hashPassword('password123');

  // Seed Admin
  const admin = await prisma.user.create({
    data: {
      name: 'System Admin',
      email: 'admin@clinic.com',
      password_hash: passHash,
      role: 'admin',
    },
  });

  // Seed Doctor
  const doctorUser = await prisma.user.create({
    data: {
      name: 'Dr. Sarah Jenkins',
      email: 'doctor@clinic.com',
      password_hash: passHash,
      role: 'doctor',
      doctor_profile: {
        create: {
          specialisation: 'Cardiology',
          slot_duration_min: 30,
          working_hours: JSON.stringify({ start: '09:00', end: '17:00' }),
        },
      },
    },
  });

  // Seed Doctor 2
  const doctorUser2 = await prisma.user.create({
    data: {
      name: 'Dr. Alex Rivera',
      email: 'alex.rivera@clinic.com',
      password_hash: passHash,
      role: 'doctor',
      doctor_profile: {
        create: {
          specialisation: 'Dermatology',
          slot_duration_min: 30,
          working_hours: JSON.stringify({ start: '10:00', end: '16:00' }),
        },
      },
    },
  });

  // Seed Patient
  const patient = await prisma.user.create({
    data: {
      name: 'Jane Doe',
      email: 'patient@clinic.com',
      password_hash: passHash,
      role: 'patient',
    },
  });

  console.log('Database Seeded Successfully!');
  console.log(`Admin: admin@clinic.com / password123`);
  console.log(`Doctor: doctor@clinic.com / password123`);
  console.log(`Patient: patient@clinic.com / password123`);
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
