import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/authMiddleware';
import { prisma } from '../db/prisma';
import { generatePostVisitSummary } from '../utils/llm';
import { createMedicationReminders } from '../services/reminderService';
import { appEventEmitter } from '../events/eventEmitter';

export async function getDoctorAppointments(req: AuthenticatedRequest, res: Response) {
  const doctorId = req.user!.userId;
  const { date } = req.query;

  let dateFilter = {};
  if (date && typeof date === 'string') {
    const startOfDay = new Date(`${date}T00:00:00.000Z`);
    const endOfDay = new Date(`${date}T23:59:59.999Z`);
    dateFilter = { slot_start: { gte: startOfDay, lte: endOfDay } };
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      doctor_id: doctorId,
      ...dateFilter,
    },
    include: {
      patient: { select: { id: true, name: true, email: true } },
      symptom_form: true,
      visit_note: true,
    },
    orderBy: { slot_start: 'asc' },
  });

  const formatted = appointments.map((a) => ({
    id: a.id,
    patient_id: a.patient_id,
    patient_name: a.patient.name,
    patient_email: a.patient.email,
    slot_start: a.slot_start,
    slot_end: a.slot_end,
    status: a.status,
    symptom_summary: a.symptom_form
      ? {
          symptoms: a.symptom_form.symptoms_text,
          ai_summary: a.symptom_form.ai_summary ? JSON.parse(a.symptom_form.ai_summary) : null,
          ai_status: a.symptom_form.ai_status,
        }
      : null,
    visit_note: a.visit_note
      ? {
          notes: a.visit_note.doctor_notes,
          prescription: a.visit_note.prescription ? JSON.parse(a.visit_note.prescription) : [],
          ai_patient_summary: a.visit_note.ai_patient_summary,
          ai_status: a.visit_note.ai_status,
        }
      : null,
  }));

  return res.json({ appointments: formatted });
}

export async function getSymptomSummary(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;

  const symptomForm = await prisma.symptomForm.findUnique({
    where: { appointment_id: id },
    include: {
      appointment: { include: { patient: { select: { name: true, email: true } } } },
    },
  });

  if (!symptomForm) {
    return res.status(404).json({ error: 'Symptom summary not found' });
  }

  return res.json({
    symptomForm: {
      patient_name: symptomForm.appointment.patient.name,
      symptoms: symptomForm.symptoms_text,
      ai_summary: symptomForm.ai_summary ? JSON.parse(symptomForm.ai_summary) : null,
      ai_status: symptomForm.ai_status,
    },
  });
}

export async function submitNotes(req: AuthenticatedRequest, res: Response) {
  const { id } = req.params;
  const { doctor_notes, prescription } = req.body;

  const appointment = await prisma.appointment.findUnique({ where: { id } });
  if (!appointment) {
    return res.status(404).json({ error: 'Appointment not found' });
  }

  // FIX: Backend Guard - Only allow notes submission for confirmed or completed appointments
  if (appointment.status !== 'confirmed' && appointment.status !== 'completed') {
    return res.status(400).json({ error: 'Clinical notes can only be submitted for confirmed or completed appointments' });
  }

  const prescriptionJson = prescription ? JSON.stringify(prescription) : null;

  // Generate Post-Visit LLM Summary
  const { data: aiPostVisit, status: aiStatus } = await generatePostVisitSummary(
    doctor_notes,
    prescription ? JSON.stringify(prescription) : undefined
  );

  const visitNote = await prisma.visitNote.upsert({
    where: { appointment_id: id },
    create: {
      appointment_id: id,
      doctor_notes,
      prescription: prescriptionJson,
      ai_patient_summary: aiPostVisit.patient_summary,
      ai_status: aiStatus,
    },
    update: {
      doctor_notes,
      prescription: prescriptionJson,
      ai_patient_summary: aiPostVisit.patient_summary,
      ai_status: aiStatus,
    },
  });

  // Mark appointment as completed
  await prisma.appointment.update({
    where: { id },
    data: { status: 'completed' },
  });

  // Create medication reminders if prescription provided
  if (prescription && prescription.length > 0) {
    await createMedicationReminders(id, prescription);
  }

  // Emit event
  appEventEmitter.emit('visit.completed', {
    appointmentId: id,
    patientId: appointment.patient_id,
    doctorId: appointment.doctor_id,
    slotStart: appointment.slot_start,
    slotEnd: appointment.slot_end,
  });

  return res.json({
    message: 'Post-visit notes and prescription submitted successfully',
    visitNote: {
      id: visitNote.id,
      doctor_notes: visitNote.doctor_notes,
      prescription: visitNote.prescription ? JSON.parse(visitNote.prescription) : [],
      ai_patient_summary: visitNote.ai_patient_summary,
      ai_status: visitNote.ai_status,
    },
  });
}
