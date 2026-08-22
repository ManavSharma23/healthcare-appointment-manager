import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../src/db/prisma';
import { seedDatabase } from '../src/seed';
import { createSlotHold, SlotUnavailableError } from '../src/services/bookingService';
import { addDoctorLeave } from '../src/services/leaveService';

describe('Healthcare System Core Mechanisms Tests', () => {
  beforeAll(async () => {
    await seedDatabase();
  });

  it('MANDATORY CONCURRENCY TEST: Exactly 1 out of N parallel booking holds succeeds on the same slot', async () => {
    const doctor = await prisma.user.findFirst({ where: { role: 'doctor' } });
    const patient = await prisma.user.findFirst({ where: { role: 'patient' } });

    expect(doctor).toBeDefined();
    expect(patient).toBeDefined();

    // Specific slot start time
    const slotStart = '2026-09-01T10:00:00.000Z';

    // Cleanup any existing test appointment for this slot
    await prisma.appointment.deleteMany({
      where: {
        doctor_id: doctor!.id,
        slot_start: new Date(slotStart),
      },
    });

    const PARALLEL_REQUEST_COUNT = 10;
    const promises = [];

    // Fire 10 parallel slot hold requests simultaneously
    for (let i = 0; i < PARALLEL_REQUEST_COUNT; i++) {
      promises.push(
        createSlotHold(patient!.id, doctor!.id, slotStart)
          .then((res) => ({ status: 'fulfilled', data: res }))
          .catch((err) => ({ status: 'rejected', error: err }))
      );
    }

    const results = await Promise.all(promises);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');

    console.log(`[CONCURRENCY TEST RESULT]: ${fulfilled.length} succeeded, ${rejected.length} rejected.`);

    // Assert strictly that EXACTLY 1 request succeeded
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(PARALLEL_REQUEST_COUNT - 1);

    // Verify rejected errors are SlotUnavailableError / slot taken
    for (const r of rejected) {
      expect((r as any).error.message).toContain('Slot no longer available');
    }
  }, 15000);

  it('Doctor Leave Conflict Test: Cancels confirmed appointments on leave date', async () => {
    const doctor = await prisma.user.findFirst({ where: { role: 'doctor' } });
    const patient = await prisma.user.findFirst({ where: { role: 'patient' } });

    const dateStr = '2026-10-25';
    const slotStart = `${dateStr}T11:00:00.000Z`;

    // Clean up any existing leave record or appointment for this test date
    await prisma.doctorLeave.deleteMany({
      where: { date: dateStr },
    });
    await prisma.appointment.deleteMany({
      where: { doctor_id: doctor!.id, slot_start: new Date(slotStart) },
    });

    // Create a confirmed appointment
    const hold = await createSlotHold(patient!.id, doctor!.id, slotStart);
    await prisma.appointment.update({
      where: { id: hold.id },
      data: { status: 'confirmed' },
    });

    // Mark doctor on leave for this date
    const leaveResult = await addDoctorLeave(doctor!.id, dateStr, 'Attending Medical Conference');

    expect(leaveResult.cancelledAppointmentsCount).toBeGreaterThanOrEqual(1);

    // Verify appointment status is cancelled
    const updatedAppt = await prisma.appointment.findUnique({ where: { id: hold.id } });
    expect(updatedAppt?.status).toBe('cancelled');
  });
});
