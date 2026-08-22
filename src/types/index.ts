export type UserRole = 'patient' | 'doctor' | 'admin';

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface PreVisitAiSummary {
  urgency: 'Low' | 'Medium' | 'High';
  chief_complaint: string;
  questions: string[];
}

export interface PostVisitAiSummary {
  patient_summary: string;
  medication_schedule: {
    medicine: string;
    dosage: string;
    frequency: string;
    duration: string;
  }[];
  follow_up_steps: string[];
}
