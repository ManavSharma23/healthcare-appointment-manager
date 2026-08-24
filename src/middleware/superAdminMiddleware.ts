import { Request, Response, NextFunction } from 'express';

const SUPERADMIN_KEY = process.env.SUPERADMIN_ACCESS_KEY || 'superadmin123';

export function verifySuperAdmin(req: Request, res: Response, next: NextFunction) {
  const key = req.headers['x-superadmin-key'] || req.headers['authorization']?.replace('Bearer ', '');

  if (!key || key !== SUPERADMIN_KEY) {
    return res.status(403).json({
      error: 'Access Denied: Invalid or missing Super Admin access key. Elevated permissions required.',
    });
  }

  next();
}
