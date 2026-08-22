import { prisma } from '../db/prisma';
import { sendEmail } from '../utils/email';

export async function createMedicationReminders(appointmentId: string, prescriptionList: any[]) {
  // Clear any existing reminders for this appointment
  await prisma.medicationReminder.deleteMany({ where: { appointment_id: appointmentId } });

  const createdReminders = [];
  const now = new Date();

  for (const item of prescriptionList) {
    const medicine = item.medicine || 'Prescribed Medicine';
    const frequency = item.frequency || 'daily';

    // Calculate next send time based on frequency
    let intervalHours = 24; // default daily
    if (frequency.toLowerCase().includes('twice') || frequency.includes('12')) {
      intervalHours = 12;
    } else if (frequency.toLowerCase().includes('thrice') || frequency.includes('8')) {
      intervalHours = 8;
    }

    const nextSendAt = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

    const reminder = await prisma.medicationReminder.create({
      data: {
        appointment_id: appointmentId,
        medicine,
        frequency,
        next_send_at: nextSendAt,
        status: 'active',
      },
    });

    createdReminders.push(reminder);
  }

  return createdReminders;
}

export async function processDueMedicationReminders() {
  const dueReminders = await prisma.medicationReminder.findMany({
    where: {
      status: 'active',
      next_send_at: { lte: new Date() },
    },
    include: {
      appointment: {
        include: {
          patient: true,
        },
      },
    },
  });

  let count = 0;
  for (const reminder of dueReminders) {
    const patient = reminder.appointment.patient;
    try {
      await sendEmail(
        patient.email,
        `Medication Reminder: ${reminder.medicine}`,
        `<p>Dear ${patient.name}, this is a reminder to take your medication: <strong>${reminder.medicine}</strong> (${reminder.frequency}).</p>`
      );

      // Recalculate next send time or mark done
      const intervalHours = reminder.frequency.includes('twice') ? 12 : 24;
      const nextSendAt = new Date(Date.now() + intervalHours * 60 * 60 * 1000);

      await prisma.medicationReminder.update({
        where: { id: reminder.id },
        data: {
          next_send_at: nextSendAt,
        },
      });

      count++;
    } catch (err) {
      console.error(`[REMINDER FAILED ${reminder.id}]:`, err);
    }
  }

  return count;
}
