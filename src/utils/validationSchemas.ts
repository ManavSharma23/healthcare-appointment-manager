import { z } from 'zod';

export const RegisterSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(['patient', 'doctor', 'admin']),
  specialisation: z.string().optional(),
  slot_duration_min: z.number().int().positive().optional(),
  working_hours: z.object({ start: z.string(), end: z.string() }).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const CreateDoctorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  specialisation: z.string().min(2),
  slot_duration_min: z.number().int().default(30),
  working_hours: z.object({
    start: z.string().default('09:00'),
    end: z.string().default('17:00'),
  }),
});

export const DoctorLeaveSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reason: z.string().optional(),
});

export const HoldSlotSchema = z.object({
  doctorId: z.string(),
  slotStart: z.string().datetime(),
});

export const SubmitSymptomsSchema = z.object({
  symptoms: z.string().min(5),
});

export const SubmitNotesSchema = z.object({
  doctor_notes: z.string().min(5),
  prescription: z.array(
    z.object({
      medicine: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      duration: z.string(),
    })
  ).optional(),
});
