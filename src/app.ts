import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import adminRoutes from './routes/adminRoutes';
import patientRoutes from './routes/patientRoutes';
import doctorRoutes from './routes/doctorRoutes';
import internalRoutes from './routes/internalRoutes';

dotenv.config();

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/', internalRoutes);
app.use('/auth', authRoutes);
app.use('/admin', adminRoutes);
app.use('/patients', patientRoutes);
app.use('/doctors', doctorRoutes);

// Global Error Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[UNHANDLED ERROR]:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});
