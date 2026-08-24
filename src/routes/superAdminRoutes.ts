import { Router } from 'express';
import {
  verifySuperAdminKey,
  purgeExpiredHolds,
  getAuditLogs,
  getSystemConfig,
  updateSystemConfig,
} from '../controllers/superAdminController';
import { verifySuperAdmin } from '../middleware/superAdminMiddleware';

const router = Router();

// Public route to verify superadmin key
router.post('/verify', verifySuperAdminKey);

// Protected routes requiring x-superadmin-key header
router.use(verifySuperAdmin);

router.post('/cleanup-expired-holds', purgeExpiredHolds);
router.get('/audit-logs', getAuditLogs);
router.get('/system-config', getSystemConfig);
router.patch('/system-config', updateSystemConfig);

export default router;
