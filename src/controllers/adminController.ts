import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { hashPassword } from '../utils/auth';
import { addDoctorLeave } from '../services/leaveService';

export async function createDoctor(req: Request, res: Response) {
  const { name, email, password, specialisation, slot_duration_min, working_hours } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const password_hash = await hashPassword(password);

  const doctorUser = await prisma.user.create({
    data: {
      name,
      email,
      password_hash,
      role: 'doctor',
      doctor_profile: {
        create: {
          specialisation: specialisation || 'General Medicine',
          slot_duration_min: slot_duration_min || 30,
          working_hours: JSON.stringify(working_hours || { start: '09:00', end: '17:00' }),
        },
      },
    },
    include: {
      doctor_profile: true,
    },
  });

  return res.status(201).json({
    message: 'Doctor created successfully',
    doctor: {
      id: doctorUser.id,
      name: doctorUser.name,
      email: doctorUser.email,
      specialisation: doctorUser.doctor_profile?.specialisation,
      slot_duration_min: doctorUser.doctor_profile?.slot_duration_min,
      working_hours: JSON.parse(doctorUser.doctor_profile?.working_hours || '{}'),
    },
  });
}

export async function updateDoctor(req: Request, res: Response) {
  const { id } = req.params;
  const { name, specialisation, slot_duration_min, working_hours, is_active } = req.body;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user || user.role !== 'doctor') {
    return res.status(404).json({ error: 'Doctor not found' });
  }

  if (name) {
    await prisma.user.update({ where: { id }, data: { name } });
  }

  const updatedProfile = await prisma.doctorProfile.update({
    where: { user_id: id },
    data: {
      ...(specialisation ? { specialisation } : {}),
      ...(slot_duration_min ? { slot_duration_min } : {}),
      ...(working_hours ? { working_hours: JSON.stringify(working_hours) } : {}),
      ...(is_active !== undefined ? { is_active } : {}),
    },
  });

  return res.json({ message: 'Doctor profile updated', profile: updatedProfile });
}

export async function setDoctorLeave(req: Request, res: Response) {
  const { id } = req.params; // doctor user_id
  const { date, reason } = req.body;

  try {
    const result = await addDoctorLeave(id, date, reason);
    return res.json({
      message: `Doctor leave set for date ${date}. Affected appointments cancelled and notified.`,
      result,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to mark doctor leave' });
  }
}

export async function getFailedNotifications(req: Request, res: Response) {
  const failedList = await prisma.notification.findMany({
    where: { status: 'failed' },
    include: {
      user: { select: { id: true, name: true, email: true } },
      appointment: true,
    },
    orderBy: { created_at: 'desc' },
  });

  return res.json({ failedNotifications: failedList });
}

export async function retryNotification(req: Request, res: Response) {
  const { id } = req.params;

  const notification = await prisma.notification.findUnique({ where: { id } });
  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  await prisma.notification.update({
    where: { id },
    data: {
      status: 'pending',
      retry_count: 0,
      next_retry_at: new Date(),
    },
  });

  return res.json({ message: 'Notification queued for manual retry' });
}
