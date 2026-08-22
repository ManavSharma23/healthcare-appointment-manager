import { prisma } from '../db/prisma';
import { appEventEmitter } from '../events/eventEmitter';

export async function addDoctorLeave(userId: string, date: string, reason?: string) {
  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { user_id: userId },
  });

  if (!doctorProfile) {
    throw new Error('Doctor profile not found');
  }

  // Create leave record
  const leave = await prisma.doctorLeave.create({
    data: {
      doctor_id: doctorProfile.id,
      date,
      reason: reason || 'Doctor marked on leave',
    },
  });

  // Find all confirmed or held appointments on this date
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const affectedAppointments = await prisma.appointment.findMany({
    where: {
      doctor_id: userId,
      status: { in: ['confirmed', 'held'] },
      slot_start: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
  });

  // Cancel affected appointments and emit leave.conflict events
  for (const appt of affectedAppointments) {
    await prisma.appointment.update({
      where: { id: appt.id },
      data: { status: 'cancelled' },
    });

    appEventEmitter.emit('leave.conflict', {
      appointmentId: appt.id,
      patientId: appt.patient_id,
      doctorId: appt.doctor_id,
      slotStart: appt.slot_start,
      slotEnd: appt.slot_end,
      reason: reason || 'Doctor marked on leave for this date',
    });
  }

  return { leave, cancelledAppointmentsCount: affectedAppointments.length };
}
