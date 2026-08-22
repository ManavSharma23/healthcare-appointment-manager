import { prisma } from '../db/prisma';
import { appEventEmitter } from '../events/eventEmitter';

export class SlotUnavailableError extends Error {
  constructor(message: string = 'Slot no longer available') {
    super(message);
    this.name = 'SlotUnavailableError';
  }
}

export async function createSlotHold(patientId: string, doctorId: string, slotStartIso: string) {
  const slotStart = new Date(slotStartIso);
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { user_id: doctorId } });
  const slotDuration = doctorProfile?.slot_duration_min || 30;
  const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);

  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes TTL

  // Check if doctor is on leave on this date (YYYY-MM-DD)
  const dateStr = slotStart.toISOString().split('T')[0];
  const leave = await prisma.doctorLeave.findFirst({
    where: {
      doctor: { user_id: doctorId },
      date: dateStr,
    },
  });

  if (leave) {
    throw new SlotUnavailableError('Doctor is on leave on this date');
  }

  // Transaction with unique index constraint violation safety
  try {
    const appointment = await prisma.$transaction(
      async (tx) => {
        // Clean up any old expired holds for this doctor and slot
        await tx.appointment.deleteMany({
          where: {
            doctor_id: doctorId,
            slot_start: slotStart,
            status: 'held',
            expires_at: { lt: new Date() },
          },
        });

        // Insert held slot
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
    // Unique index violation (P2002 in Prisma) or concurrent database write contention
    if (
      error.code === 'P2002' ||
      error.message?.includes('UNIQUE constraint failed') ||
      error.message?.includes('Transaction') ||
      error.message?.includes('timed out') ||
      error.message?.includes('database') ||
      error.name === 'SlotUnavailableError'
    ) {
      throw new SlotUnavailableError('Slot no longer available');
    }
    throw error;
  }
}

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

export async function cancelAppointment(appointmentId: string, userId: string, reason?: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
  });

  if (!appointment) {
    throw new Error('Appointment not found');
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
