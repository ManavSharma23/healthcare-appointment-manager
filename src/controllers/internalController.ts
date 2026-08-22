import { Request, Response } from 'express';
import { expireHeldSlots } from '../services/bookingService';
import { processDueMedicationReminders } from '../services/reminderService';
import { retryFailedNotifications } from '../services/notificationService';

export async function healthCheck(req: Request, res: Response) {
  return res.json({
    status: 'ok',
    service: 'Healthcare Appointment & Follow-up Manager API',
    timestamp: new Date().toISOString(),
  });
}

export async function cronExpireHolds(req: Request, res: Response) {
  try {
    const count = await expireHeldSlots();
    return res.json({ message: `Expired ${count} held slots past TTL.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function cronSendReminders(req: Request, res: Response) {
  try {
    const count = await processDueMedicationReminders();
    return res.json({ message: `Processed ${count} due medication reminders.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}

export async function cronRetryNotifications(req: Request, res: Response) {
  try {
    const count = await retryFailedNotifications();
    return res.json({ message: `Retried ${count} failed notifications.` });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
