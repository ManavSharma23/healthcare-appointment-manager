import { Request, Response } from 'express';
import { prisma } from '../db/prisma';
import { logAuditEvent } from '../utils/auditLogger';

let systemConfig = {
  hold_ttl_minutes: 5,
  default_slot_duration_min: 30,
  max_retry_attempts: 3,
  system_maintenance_mode: false,
};

export async function verifySuperAdminKey(req: Request, res: Response) {
  const { key } = req.body;
  const expectedKey = process.env.SUPERADMIN_ACCESS_KEY || 'superadmin123';

  if (!key || key !== expectedKey) {
    return res.status(401).json({ error: 'Invalid Super Admin key or passcode' });
  }

  await logAuditEvent('superadmin', 'Developer/SuperAdmin', 'SUPERADMIN_UNLOCKED', 'Elevated Super Admin access session initiated');

  return res.json({
    success: true,
    message: 'Super Admin access granted. Elevated session active for 15 minutes.',
    expiresInSeconds: 900,
  });
}

export async function purgeExpiredHolds(req: Request, res: Response) {
  const now = new Date();

  // Find all held appointments that are past expiry
  const expiredHolds = await prisma.appointment.findMany({
    where: {
      status: 'held',
      expires_at: { lt: now },
    },
  });

  const count = expiredHolds.length;

  if (count > 0) {
    const ids = expiredHolds.map(h => h.id);
    await prisma.appointment.deleteMany({
      where: { id: { in: ids } },
    });
  }

  await logAuditEvent(
    'superadmin',
    'Developer/SuperAdmin',
    'EXPIRED_HOLDS_PURGED',
    `Database Cleanup: Successfully purged ${count} abandoned/expired slot hold(s) with no patient investment.`
  );

  return res.json({
    message: `Database Cleanup Complete: ${count} expired hold(s) purged.`,
    purgedCount: count,
  });
}

export async function getAuditLogs(req: Request, res: Response) {
  const { query, action, role, startDate, endDate, page = '1', limit = '15', exportFormat } = req.query;

  const where: any = {};
  if (action && typeof action === 'string') {
    where.action = { contains: action };
  }
  if (role && typeof role === 'string') {
    where.actor_role = role;
  }
  if (startDate && typeof startDate === 'string') {
    where.created_at = { ...where.created_at, gte: new Date(`${startDate}T00:00:00.000Z`) };
  }
  if (endDate && typeof endDate === 'string') {
    where.created_at = { ...where.created_at, lte: new Date(`${endDate}T23:59:59.999Z`) };
  }
  if (query && typeof query === 'string') {
    where.OR = [
      { details: { contains: query } },
      { action: { contains: query } },
      { actor_name: { contains: query } },
    ];
  }

  // Handle CSV export for compliance reporting
  if (exportFormat === 'csv') {
    const allLogs = await prisma.auditLog.findMany({
      where,
      orderBy: { created_at: 'desc' },
    });

    const csvRows = [
      'ID,Timestamp,Actor Role,Actor Name,Action,Details',
      ...allLogs.map(l => 
        `"${l.id}","${l.created_at.toISOString()}","${l.actor_role}","${l.actor_name || ''}","${l.action}","${(l.details || '').replace(/"/g, '""')}"`
      )
    ];

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="audit_log_export_${Date.now()}.csv"`);
    return res.status(200).send(csvRows.join('\n'));
  }

  const p = Math.max(1, parseInt(String(page)));
  const l = Math.max(1, Math.min(100, parseInt(String(limit))));

  const total = await prisma.auditLog.count({ where });
  const logs = await prisma.auditLog.findMany({
    where,
    orderBy: { created_at: 'desc' },
    skip: (p - 1) * l,
    take: l,
  });

  return res.json({
    logs,
    pagination: {
      total,
      page: p,
      limit: l,
      totalPages: Math.ceil(total / l) || 1,
    },
  });
}

export async function getSystemConfig(req: Request, res: Response) {
  return res.json({ config: systemConfig });
}

export async function updateSystemConfig(req: Request, res: Response) {
  const { hold_ttl_minutes, default_slot_duration_min, max_retry_attempts, system_maintenance_mode } = req.body;

  if (hold_ttl_minutes !== undefined) systemConfig.hold_ttl_minutes = Number(hold_ttl_minutes);
  if (default_slot_duration_min !== undefined) systemConfig.default_slot_duration_min = Number(default_slot_duration_min);
  if (max_retry_attempts !== undefined) systemConfig.max_retry_attempts = Number(max_retry_attempts);
  if (system_maintenance_mode !== undefined) systemConfig.system_maintenance_mode = Boolean(system_maintenance_mode);

  await logAuditEvent(
    'superadmin',
    'Developer/SuperAdmin',
    'SYSTEM_CONFIG_UPDATED',
    `Updated system settings: ${JSON.stringify(systemConfig)}`
  );

  return res.json({ message: 'System configuration updated successfully', config: systemConfig });
}
