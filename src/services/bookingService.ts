import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma';
import { appEventEmitter } from '../events/eventEmitter';

export class SlotUnavailableError extends Error {
  constructor(message: string = 'Slot no longer available') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

/**
 * Creates a 5-minute transactional slot hold with concurrency defense and atomic leave checking
 */
export async function createSlotHold(patientId: string, doctorId: string, slotStartIso: string) {
  const slotStart = new Date(slotStartIso);
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { user_id: doctorId } });
  const slotDuration = doctorProfile?.slot_duration_min || 30;
  const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL
  const dateStr = slotStart.toISOString().split('T')[0];

  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        // 1. Atomic Doctor Leave Check inside Transaction (Eliminates TOCTOU Race Condition)
        const leave = await tx.doctorLeave.findFirst({
          where: {
            doctor: { user_id: doctorId },
            date: dateStr,
          },
        });

        if (leave) {
          throw new SlotUnavailableError('Doctor is on leave on this date');
        }

        // 2. Clean up any expired holds for this doctor and slot
        await tx.appointment.deleteMany({
          where: {
            doctor_id: doctorId,
            slot_start: slotStart,
            status: 'held',
            expires_at: { lt: new Date() },
          },
        });

        // 3. Active Slot Check (allows rebooking of cancelled/expired slots while preventing double-booking active ones)
        const activeAppt = await tx.appointment.findFirst({
          where: {
            doctor_id: doctorId,
            slot_start: slotStart,
            status: { in: ['held', 'confirmed'] },
          },
        });

        if (activeAppt) {
          throw new SlotUnavailableError('Slot no longer available');
        }

        // 4. Insert newly held slot
        return await tx.appointment.create({
          data: {
            patient_id: patientId,
            doctor_id: doctorId,
            slot_start: slotStart,
            slot_end: slotEnd,
            status: 'held',
            expires_at: expiresAt,
          },
        });
      },
      { timeout: 15000 }
    );

    return appointment;
  } catch (error: any) {
    if (error instanceof SlotUnavailableError || error.name === 'SlotUnavailableError') {
      throw error;
    }
    // DB-level Partial Unique Index Defense (P2002) and SQLite file-lock write contention
    if (
      (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') ||
      error.message?.includes('timed out') ||
      error.message?.includes('database') ||
      error.message?.includes('Context')
    ) {
      throw new SlotUnavailableError('Slot no longer available');
    }
    throw error;
  }
}

/**
 * Confirms a held appointment and dispatches notification events
 */
export async function confirmAppointment(appointmentId: string, patientId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  if (appointment.patient_id !== patientId) {
    throw new Error('Unauthorized');
  }

  if (appointment.status === 'confirmed') {
    return appointment;
  }

  if (appointment.status === 'held' && appointment.expires_at && appointment.expires_at < new Date()) {
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'cancelled' },
    });
    throw new SlotUnavailableError('Slot hold expired. Please re-select a slot.');
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: 'confirmed',
      expires_at: null,
    },
  });

  // Emit confirmation event for notification & calendar sync
  appEventEmitter.emit('appointment.confirmed', {
    appointmentId: updated.id,
    patientId: updated.patient_id,
    doctorId: updated.doctor_id,
    slotStart: updated.slot_start,
    slotEnd: updated.slot_end,
  });

  return updated;
}

/**
 * Cancels an appointment with strict role & ownership authorization check
 */
export async function cancelAppointment(
  appointmentId: string,
  userId: string,
  userRole?: string,
  reason?: string
) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new Error('Appointment not found');
  }

  // FIX: Authorization Check - Only patient, doctor, or admin can cancel
  if (
    appointment.patient_id !== userId &&
    appointment.doctor_id !== userId &&
    userRole !== 'admin'
  ) {
    throw new Error('Unauthorized');
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: 'cancelled' },
  });

  appEventEmitter.emit('appointment.cancelled', {
    appointmentId: updated.id,
    patientId: updated.patient_id,
    doctorId: updated.doctor_id,
    slotStart: updated.slot_start,
    slotEnd: updated.slot_end,
    reason,
  });

  return updated;
}

/**
 * Cron worker to expire held slots past TTL
 */
export async function expireHeldSlots() {
  const result = await prisma.appointment.updateMany({
    where: {
      status: 'held',
      expires_at: { lt: new Date() },
    },
    data: {
      status: 'cancelled',
    },
  });
  return result.count;
}
