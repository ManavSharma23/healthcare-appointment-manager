import { Router } from 'express';
import { getDoctorAppointments, getSymptomSummary, submitNotes } from '../controllers/doctorController';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { SubmitNotesSchema } from '../utils/validationSchemas';

const router = Router();

router.use(authenticate, authorizeRoles('doctor'));

router.get('/appointments', getDoctorAppointments);
router.get('/appointments/:id/symptom-summary', getSymptomSummary);
router.post('/appointments/:id/notes', validateBody(SubmitNotesSchema), submitNotes);

export default router;
