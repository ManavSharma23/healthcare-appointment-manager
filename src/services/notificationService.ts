import { prisma } from '../db/prisma';
import { sendEmail } from '../utils/email';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '../utils/googleCalendar';

export async function processNotificationEvent(eventType: string, data: any) {
  const { appointmentId, patientId, doctorId, reason, slotStart, slotEnd } = data;

  const patient = patientId ? await prisma.user.findUnique({ where: { id: patientId } }) : null;
  const doctor = doctorId ? await prisma.user.findUnique({ where: { id: doctorId } }) : null;

  if (!patient) return;

  if (eventType === 'appointment.confirmed') {
    // 1. Email Notification Record
    const notification = await prisma.notification.create({
      data: {
        user_id: patient.id,
        appointment_id: appointmentId,
        type: 'appointment_confirmed',
        channel: 'email',
        status: 'pending',
        payload: JSON.stringify({ to: patient.email, doctorName: doctor?.name, slotStart }),
      },
    });

    try {
      const emailHtml = `<h2>Appointment Confirmed</h2><p>Your appointment with Dr. ${doctor?.name || 'Doctor'} on ${new Date(slotStart).toLocaleString()} is confirmed.</p>`;
      await sendEmail(patient.email, 'Appointment Confirmation - HealthCare App', emailHtml);
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'sent' },
      });
    } catch (err) {
      console.error(`[NOTIFICATION FAILED] Appointment ${appointmentId}:`, err);
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          retry_count: 1,
          next_retry_at: new Date(Date.now() + 60 * 1000), // Retry in 1 min
        },
      });
    }

    // 2. Google Calendar Sync
    try {
      const patientToken = await prisma.calendarToken.findUnique({ where: { user_id: patient.id } });
      const gcalEventId = await createGoogleCalendarEvent(
        patientToken?.access_token || '',
        patientToken?.refresh_token || null,
        {
          summary: `Doctor Appointment with Dr. ${doctor?.name || 'Doctor'}`,
          description: `Confirmed medical visit.`,
          startISO: new Date(slotStart).toISOString(),
          endISO: new Date(slotEnd).toISOString(),
          patientEmail: patient.email,
          doctorEmail: doctor?.email,
        }
      );

      await prisma.calendarEvent.create({
        data: {
          appointment_id: appointmentId,
          google_event_id: gcalEventId,
          patient_synced: true,
          doctor_synced: true,
        },
      });
    } catch (gcalErr) {
      console.error('[CALENDAR SYNC FAILED]:', gcalErr);
    }
  }

  if (eventType === 'appointment.cancelled' || eventType === 'leave.conflict') {
    const notification = await prisma.notification.create({
      data: {
        user_id: patient.id,
        appointment_id: appointmentId,
        type: eventType === 'leave.conflict' ? 'leave_conflict' : 'appointment_cancelled',
        channel: 'email',
        status: 'pending',
        payload: JSON.stringify({ to: patient.email, reason: reason || 'Cancelled by clinic/doctor' }),
      },
    });

    try {
      const subject = eventType === 'leave.conflict' ? 'Appointment Cancelled - Doctor on Leave' : 'Appointment Cancellation';
      const emailHtml = `<h2>${subject}</h2><p>Dear ${patient.name}, your appointment on ${new Date(slotStart).toLocaleString()} has been cancelled. ${reason ? `Reason: ${reason}` : ''}</p><p>Please log in to reschedule your appointment.</p>`;
      await sendEmail(patient.email, subject, emailHtml);
      await prisma.notification.update({
        where: { id: notification.id },
        data: { status: 'sent' },
      });
    } catch (err) {
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          status: 'failed',
          retry_count: 1,
          next_retry_at: new Date(Date.now() + 60 * 1000),
        },
      });
    }

    // Delete Calendar Event if created
    const existingCalEvent = await prisma.calendarEvent.findUnique({ where: { appointment_id: appointmentId } });
    if (existingCalEvent) {
      const patientToken = await prisma.calendarToken.findUnique({ where: { user_id: patient.id } });
      await deleteGoogleCalendarEvent(
        patientToken?.access_token || '',
        patientToken?.refresh_token || null,
        existingCalEvent.google_event_id
      );
      await prisma.calendarEvent.delete({ where: { id: existingCalEvent.id } });
    }
  }
}

/**
 * Retry Failed Notifications Job
 */
export async function retryFailedNotifications() {
  const failedNotifications = await prisma.notification.findMany({
    where: {
      status: 'failed',
      retry_count: { lt: 3 },
      next_retry_at: { lte: new Date() },
    },
  });

  let retriedCount = 0;
  for (const notif of failedNotifications) {
    if (!notif.payload) continue;
    const payload = JSON.parse(notif.payload);
    try {
      await sendEmail(payload.to, 'Notification Update', `<p>${payload.reason || 'Appointment status update'}</p>`);
      await prisma.notification.update({
        where: { id: notif.id },
        data: { status: 'sent', next_retry_at: null },
      });
      retriedCount++;
    } catch (err) {
      const nextRetryMinutes = notif.retry_count === 1 ? 5 : 15;
      const finalStatus = notif.retry_count + 1 >= 3 ? 'failed' : 'failed';
      await prisma.notification.update({
        where: { id: notif.id },
        data: {
          retry_count: notif.retry_count + 1,
          status: finalStatus,
          next_retry_at: new Date(Date.now() + nextRetryMinutes * 60 * 1000),
        },
      });
    }
  }
  return retriedCount;
}
