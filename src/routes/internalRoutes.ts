import { Router } from 'express';
import { healthCheck, cronExpireHolds, cronSendReminders, cronRetryNotifications } from '../controllers/internalController';

const router = Router();

router.get('/health', healthCheck);
router.post('/internal/cron/expire-holds', cronExpireHolds);
router.post('/internal/cron/send-reminders', cronSendReminders);
router.post('/internal/cron/retry-notifications', cronRetryNotifications);

export default router;
