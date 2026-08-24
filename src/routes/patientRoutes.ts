import { Router } from 'express';
import { getDoctors, getDoctorSlots, createHold, confirm, cancel, submitSymptoms, getAppointmentSummary, getPatientAppointments } from '../controllers/patientController';
import { authenticate, authorizeRoles } from '../middleware/authMiddleware';
import { validateBody } from '../middleware/validate';
import { HoldSlotSchema, SubmitSymptomsSchema } from '../utils/validationSchemas';

const router = Router();

router.use(authenticate, authorizeRoles('patient'));

router.get('/doctors', getDoctors);
router.get('/doctors/:id/slots', getDoctorSlots);
router.get('/my-appointments', getPatientAppointments);
router.post('/appointments', validateBody(HoldSlotSchema), createHold);
router.post('/appointments/:id/confirm', confirm);
router.post('/appointments/:id/cancel', cancel);
router.post('/appointments/:id/symptoms', validateBody(SubmitSymptomsSchema), submitSymptoms);
router.get('/appointments/:id/summary', getAppointmentSummary);

export default router;
