import { Router } from 'express';
import { createDoctor, updateDoctor, setDoctorLeave, getFailedNotifications, retryNotification } from '../controllers/adminController';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { CreateDoctorSchema, DoctorLeaveSchema } from '../utils/validationSchemas';

const router = Router();

router.use(authenticate, authorizeRoles('admin'));

router.post('/doctors', validateBody(CreateDoctorSchema), createDoctor);
router.patch('/doctors/:id', updateDoctor);
router.post('/doctors/:id/leave', validateBody(DoctorLeaveSchema), setDoctorLeave);
router.get('/notifications/failed', getFailedNotifications);
router.post('/notifications/:id/retry', retryNotification);

export default router;
