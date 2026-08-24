import { prisma } from '../db/prisma';

export async function logAuditEvent(
  actorRole: string,
  actorName: string | null | undefined,
  action: string,
  details: string
) {
  try {
    const log = await prisma.auditLog.create({
      data: {
        actor_role: actorRole,
        actor_name: actorName || 'System',
        action,
        details,
      },
    });
    return log;
  } catch (err) {
    console.error('[AuditLog Error]: Failed to create audit log entry', err);
    return null;
  }
}
