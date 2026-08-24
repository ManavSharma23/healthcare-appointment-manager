import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { hashPassword } from '../utils/auth';
import { addDoctorLeave } from '../services/leaveService';
import { logAuditEvent } from '../utils/auditLogger';

export async function createDoctor(req: Request, res: Response) {
  const { name, email, password, specialisation, slot_duration_min, working_hours } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  // Format doctor name consistently with 'Dr.' prefix
  let formattedName = name.trim();
  if (!formattedName.startsWith('Dr.') && !formattedName.startsWith('Dr ')) {
    formattedName = `Dr. ${formattedName}`;
  } else if (formattedName.startsWith('Dr ')) {
    formattedName = `Dr. ${formattedName.substring(3).trim()}`;
  }

  // Check for duplicate name warning
  const nameMatch = await prisma.user.findFirst({
    where: {
      role: 'doctor',
      name: { equals: formattedName, mode: 'insensitive' },
    },
  });

  if (nameMatch) {
    return res.status(400).json({
      error: `A doctor with name "${nameMatch.name}" already exists (${nameMatch.email}). Duplicate names are not permitted to maintain roster clarity.`,
    });
  }

  const password_hash = await hashPassword(password);

  const doctorUser = await prisma.user.create({
    data: {
      name: formattedName,
      email: email.trim().toLowerCase(),
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

  await logAuditEvent('admin', (req as any).user?.email || 'Admin', 'DOCTOR_CREATED', `Created doctor account: ${formattedName} (${email})`);

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

export async function getAdminDoctors(req: Request, res: Response) {
  const doctors = await prisma.user.findMany({
    where: { role: 'doctor' },
    select: {
      id: true,
      name: true,
      email: true,
      created_at: true,
      doctor_profile: true,
      _count: {
        select: {
          appointments_as_doctor: true,
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  const formatted = doctors.map(d => ({
    id: d.id,
    name: d.name,
    email: d.email,
    specialisation: d.doctor_profile?.specialisation || 'General Medicine',
    slot_duration_min: d.doctor_profile?.slot_duration_min || 30,
    working_hours: d.doctor_profile ? JSON.parse(d.doctor_profile.working_hours) : { start: '09:00', end: '17:00' },
    is_active: d.doctor_profile?.is_active ?? true,
    appointment_count: d._count.appointments_as_doctor,
  }));

  return res.json({ doctors: formatted });
}

export async function toggleDoctorStatus(req: Request, res: Response) {
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { is_active } = req.body;

  if (typeof is_active !== 'boolean') {
    return res.status(400).json({ error: 'is_active boolean field is required' });
  }

  const doctorUser = await prisma.user.findUnique({
    where: { id: doctorId },
    include: { doctor_profile: true },
  });

  if (!doctorUser || doctorUser.role !== 'doctor' || !doctorUser.doctor_profile) {
    return res.status(404).json({ error: 'Doctor profile not found' });
  }

  const updated = await prisma.doctorProfile.update({
    where: { user_id: doctorId },
    data: { is_active },
  });

  const action = is_active ? 'DOCTOR_REACTIVATED' : 'DOCTOR_DEACTIVATED';
  await logAuditEvent(
    'admin',
    (req as any).user?.email || 'Admin',
    action,
    `${is_active ? 'Reactivated' : 'Deactivated'} doctor ${doctorUser.name} (${doctorUser.email})`
  );

  return res.json({
    message: `Doctor ${is_active ? 'reactivated' : 'deactivated'} successfully`,
    profile: updated,
  });
}

export async function hardDeleteDoctor(req: Request, res: Response) {
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const doctorUser = await prisma.user.findUnique({
    where: { id: doctorId },
    include: {
      doctor_profile: true,
      _count: {
        select: { appointments_as_doctor: true },
      },
    },
  });

  if (!doctorUser || doctorUser.role !== 'doctor') {
    return res.status(404).json({ error: 'Doctor user not found' });
  }

  const appointmentCount = doctorUser._count.appointments_as_doctor;
  if (appointmentCount > 0) {
    return res.status(400).json({
      error: `Cannot hard-delete doctor "${doctorUser.name}" because they have ${appointmentCount} appointment(s) in historical records. Use Deactivate instead to preserve clinical history.`,
      appointmentCount,
    });
  }

  // Delete doctor profile and user account (0 appointments exist)
  if (doctorUser.doctor_profile) {
    await prisma.doctorLeave.deleteMany({ where: { doctor_id: doctorUser.doctor_profile.id } });
    await prisma.doctorProfile.delete({ where: { user_id: doctorId } });
  }
  await prisma.user.delete({ where: { id: doctorId } });

  await logAuditEvent(
    'admin',
    (req as any).user?.email || 'Admin',
    'DOCTOR_HARD_DELETED',
    `Permanently purged zero-appointment doctor account: ${doctorUser.name} (${doctorUser.email})`
  );

  return res.json({ message: `Doctor ${doctorUser.name} was permanently deleted from the database.` });
}

export async function updateDoctor(req: Request, res: Response) {
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { name, specialisation, slot_duration_min, working_hours, is_active } = req.body;

  const user = await prisma.user.findUnique({ where: { id: doctorId } });
  if (!user || user.role !== 'doctor') {
    return res.status(404).json({ error: 'Doctor not found' });
  }

  if (name) {
    await prisma.user.update({ where: { id: doctorId }, data: { name } });
  }

  const updatedProfile = await prisma.doctorProfile.update({
    where: { user_id: doctorId },
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
  const doctorId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { date, reason } = req.body;

  try {
    const result = await addDoctorLeave(doctorId, date, reason);
    await logAuditEvent('admin', (req as any).user?.email || 'Admin', 'DOCTOR_LEAVE_SET', `Set leave for doctor on ${date}. ${result.cancelledAppointmentsCount} appointments cancelled.`);
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
  const notificationId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  await prisma.notification.update({
    where: { id: notificationId },
    data: {
      status: 'pending',
      retry_count: 0,
      next_retry_at: new Date(),
    },
  });

  await logAuditEvent('admin', (req as any).user?.email || 'Admin', 'NOTIFICATION_RETRY', `Queued notification #${notificationId.substring(0, 8)} for manual retry.`);

  return res.json({ message: 'Notification queued for manual retry' });
}


