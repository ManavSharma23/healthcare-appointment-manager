import { Router } from 'express';
import { register, login, refresh } from '../controllers/authController';
import { validateBody } from '../middleware/validate';
import { RegisterSchema, LoginSchema, RefreshTokenSchema } from '../utils/validationSchemas';

const router = Router();

router.post('/register', validateBody(RegisterSchema), register);
router.post('/login', validateBody(LoginSchema), login);
router.post('/refresh', validateBody(RefreshTokenSchema), refresh);

export default router;
