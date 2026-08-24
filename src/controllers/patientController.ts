import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { prisma } from '../db/prisma';
import { createSlotHold, confirmAppointment, cancelAppointment, SlotUnavailableError } from '../services/bookingService';
import { generatePreVisitSummary } from '../utils/llm';

export async function getDoctors(req: AuthenticatedRequest, res: Response) {
  const { specialisation } = req.query;

  const doctors = await prisma.user.findMany({
    where: {
      role: 'doctor',
      doctor_profile: {
        is_active: true,
        ...(specialisation ? { specialisation: { contains: String(specialisation) } } : {}),
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      doctor_profile: true,
    },
  });

  const formatted = doctors.map(d => ({
    id: d.id,
    name: d.name,
    email: d.email,
    specialisation: d.doctor_profile?.specialisation,
    slot_duration_min: d.doctor_profile?.slot_duration_min,
    working_hours: d.doctor_profile ? JSON.parse(d.doctor_profile.working_hours) : { start: '09:00', end: '17:00' },
  }));

  return res.json({ doctors: formatted });
}

export async function getDoctorSlots(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params; // doctor user_id
  const { date } = req.query; // YYYY-MM-DD

  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'Date query parameter is required (YYYY-MM-DD)' });
  }

  const doctorProfile = await prisma.doctorProfile.findUnique({
    where: { user_id: id },
  });

  if (!doctorProfile) {
    return res.status(404).json({ error: 'Doctor profile not found' });
  }

  // Check if doctor is on leave
  const leave = await prisma.doctorLeave.findFirst({
    where: { doctor_id: doctorProfile.id, date },
  });

  if (leave) {
    return res.json({ date, slots: [], message: 'Doctor is on leave on this date' });
  }

  const workingHours = JSON.parse(doctorProfile.working_hours || '{"start":"09:00","end":"17:00"}');
  const slotDuration = doctorProfile.slot_duration_min || 30;

  // Generate slots
  const slots = [];
  const [startHour, startMin] = workingHours.start.split(':').map(Number);
  const [endHour, endMin] = workingHours.end.split(':').map(Number);

  const slotTime = new Date(`${date}T00:00:00.000Z`);
  slotTime.setUTCHours(startHour, startMin, 0, 0);

  const endTime = new Date(`${date}T00:00:00.000Z`);
  endTime.setUTCHours(endHour, endMin, 0, 0);

  // Fetch existing held or confirmed appointments for date
  const startOfDay = new Date(`${date}T00:00:00.000Z`);
  const endOfDay = new Date(`${date}T23:59:59.999Z`);

  const existingAppointments = await prisma.appointment.findMany({
    where: {
      doctor_id: id,
      status: { in: ['held', 'confirmed'] },
      slot_start: { gte: startOfDay, lte: endOfDay },
    },
  });

  const now = new Date();

  while (slotTime < endTime) {
    const slotIso = slotTime.toISOString();
    const isBooked = existingAppointments.some(
      (a) => a.slot_start.getTime() === slotTime.getTime() && (a.status === 'confirmed' || (a.status === 'held' && a.expires_at && a.expires_at > now))
    );

    slots.push({
      slot_start: slotIso,
      available: !isBooked,
    });

    slotTime.setMinutes(slotTime.getMinutes() + slotDuration);
  }

  return res.json({ date, slots });
}

export async function createHold(req: AuthenticatedRequest, res: Response) {
  const patientId = req.user!.userId;
  const { doctorId, slotStart } = req.body;

  try {
    const appointment = await createSlotHold(patientId, doctorId, slotStart);
    return res.status(201).json({
      message: 'Slot held for 5 minutes',
      appointment: {
        id: appointment.id,
        status: appointment.status,
        expires_at: appointment.expires_at,
        slot_start: appointment.slot_start,
        slot_end: appointment.slot_end,
      },
    });
  } catch (err: any) {
    if (err instanceof SlotUnavailableError) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}

export async function confirm(req: AuthenticatedRequest, res: Response) {
  const patientId = req.user!.userId;
  const { id } = req.params;

  try {
    const appointment = await confirmAppointment(id, patientId);
    return res.json({ message: 'Appointment confirmed successfully', appointment });
  } catch (err: any) {
    if (err instanceof SlotUnavailableError) {
      return res.status(409).json({ error: err.message });
    }
    return res.status(400).json({ error: err.message || 'Confirmation failed' });
  }
}

export async function cancel(req: AuthenticatedRequest, res: Response) {
  const patientId = req.user!.userId;
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const appointment = await cancelAppointment(id, patientId, req.user!.role, reason);
    return res.json({ message: 'Appointment cancelled', appointment });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}

export async function submitSymptoms(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { symptoms } = req.body;

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  // Generate Pre-Visit LLM Summary
  const { data: aiSummary, status: aiStatus } = await generatePreVisitSummary(symptoms);

  const symptomForm = await prisma.symptomForm.upsert({
    where: { appointment_id: id },
    create: {
      appointment_id: id,
      symptoms_text: symptoms,
      ai_summary: JSON.stringify(aiSummary),
      ai_status: aiStatus,
    },
    update: {
      symptoms_text: symptoms,
      ai_summary: JSON.stringify(aiSummary),
      ai_status: aiStatus,
    },
  });

  return res.json({
    message: 'Symptoms submitted successfully',
    symptomForm: {
      id: symptomForm.id,
      symptoms_text: symptomForm.symptoms_text,
      ai_summary: JSON.parse(symptomForm.ai_summary || '{}'),
      ai_status: symptomForm.ai_status,
    },
  });
}

export async function getAppointmentSummary(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: {
      doctor: { select: { name: true, email: true, doctor_profile: true } },
      symptom_form: true,
      visit_note: true,
    },
  });

  if (!appointment) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  return res.json({
    appointment: {
      id: appointment.id,
      status: appointment.status,
      slot_start: appointment.slot_start,
      doctor_name: appointment.doctor.name,
      symptom_form: appointment.symptom_form
        ? {
            symptoms: appointment.symptom_form.symptoms_text,
            ai_summary: appointment.symptom_form.ai_summary ? JSON.parse(appointment.symptom_form.ai_summary) : null,
            ai_status: appointment.symptom_form.ai_status,
          }
        : null,
      visit_note: appointment.visit_note
        ? {
            doctor_notes: appointment.visit_note.doctor_notes,
            prescription: appointment.visit_note.prescription ? JSON.parse(appointment.visit_note.prescription) : [],
            ai_patient_summary: appointment.visit_note.ai_patient_summary,
            ai_status: appointment.visit_note.ai_status,
          }
        : null,
    },
  });
}

export async function getPatientAppointments(req: AuthenticatedRequest, res: Response) {
  const patientId = req.user!.userId;

  const appointments = await prisma.appointment.findMany({
    where: { patient_id: patientId },
    include: {
      doctor: { select: { id: true, name: true, doctor_profile: true } },
      symptom_form: true,
      visit_note: true,
    },
    orderBy: { slot_start: 'desc' },
  });

  const formatted = appointments.map((a) => ({
    id: a.id,
    doctor_id: a.doctor_id,
    doctor_name: a.doctor.name,
    specialisation: a.doctor.doctor_profile?.specialisation || 'General Medicine',
    slot_start: a.slot_start,
    slot_end: a.slot_end,
    status: a.status,
    expires_at: a.expires_at,
    symptom_summary: a.symptom_form
      ? {
          symptoms: a.symptom_form.symptoms_text,
          ai_summary: a.symptom_form.ai_summary ? JSON.parse(a.symptom_form.ai_summary) : null,
          ai_status: a.symptom_form.ai_status,
        }
      : null,
    visit_note: a.visit_note
      ? {
          doctor_notes: a.visit_note.doctor_notes,
          prescription: a.visit_note.prescription ? JSON.parse(a.visit_note.prescription) : [],
          ai_patient_summary: a.visit_note.ai_patient_summary,
          ai_status: a.visit_note.ai_status,
        }
      : null,
  }));

  return res.json({ appointments: formatted });
}
