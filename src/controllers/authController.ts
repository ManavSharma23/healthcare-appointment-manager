import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { hashPassword, comparePassword, generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/auth';

export async function register(req: Request, res: Response) {
  const { name, email, password, role, specialisation, slot_duration_min, working_hours } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const password_hash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password_hash,
      role,
      ...(role === 'doctor'
        ? {
            doctor_profile: {
              create: {
                specialisation: specialisation || 'General Medicine',
                slot_duration_min: slot_duration_min || 30,
                working_hours: JSON.stringify(working_hours || { start: '09:00', end: '17:00' }),
              },
            },
          }
        : {}),
    },
  });

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as any });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as any });

  return res.status(201).json({
    message: 'User registered successfully',
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
}

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const match = await comparePassword(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const accessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as any });
  const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as any });

  return res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
  });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token required' });
  }

  try {
    const payload = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const newAccessToken = generateAccessToken({ userId: user.id, email: user.email, role: user.role as any });
    const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role as any });

    return res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
}
