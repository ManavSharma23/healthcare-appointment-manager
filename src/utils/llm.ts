import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { PreVisitAiSummary, PostVisitAiSummary } from '../types';

export const PreVisitSummarySchema = z.object({
  urgency: z.enum(['Low', 'Medium', 'High']),
  chief_complaint: z.string(),
  questions: z.array(z.string()).min(1),
});

export const PostVisitSummarySchema = z.object({
  patient_summary: z.string(),
  medication_schedule: z.array(
    z.object({
      medicine: z.string(),
      dosage: z.string(),
      frequency: z.string(),
      duration: z.string(),
    })
  ),
  follow_up_steps: z.array(z.string()),
});

// Helper timeout wrapper
function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 10000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('LLM call timed out after 10 seconds')), timeoutMs)
    )
  ]);
}

/**
 * Generate Pre-Visit AI Symptom Summary
 */
export async function generatePreVisitSummary(symptoms: string): Promise<{ data: PreVisitAiSummary; status: 'success' | 'failed' }> {
  const prompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}
  
Return ONLY valid JSON matching this structure:
{
  "urgency": "Low" | "Medium" | "High",
  "chief_complaint": "Brief summary of symptom",
  "questions": ["Question 1", "Question 2", "Question 3"]
}`;

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });
        
        const response = await withTimeout(model.generateContent(prompt), 10000);
        const text = response.response.text();
        const json = JSON.parse(text);
        const validated = PreVisitSummarySchema.parse(json);
        
        return { data: validated, status: 'success' };
      } catch (err) {
        console.warn(`[LLM Pre-Visit Attempt ${attempt} Failed]:`, err);
      }
    }
  }

  // Fallback if API fails or key not set
  return {
    data: {
      urgency: 'Medium',
      chief_complaint: symptoms.slice(0, 100) + '...',
      questions: [
        'How long have you been experiencing these symptoms?',
        'Have you taken any medication for this?',
        'Does anything specific aggravate or relieve the symptoms?'
      ]
    },
    status: 'failed'
  };
}

/**
 * Generate Post-Visit Patient-Friendly AI Summary
 */
export async function generatePostVisitSummary(notes: string, prescriptionText?: string): Promise<{ data: PostVisitAiSummary; status: 'success' | 'failed' }> {
  const fullNotes = `Clinical Notes: ${notes}\nPrescription Info: ${prescriptionText || 'None'}`;
  const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${fullNotes}

Return ONLY valid JSON matching this structure:
{
  "patient_summary": "Friendly explanation for patient",
  "medication_schedule": [
    { "medicine": "Med Name", "dosage": "500mg", "frequency": "twice daily", "duration": "5 days" }
  ],
  "follow_up_steps": ["Step 1", "Step 2"]
}`;

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash', generationConfig: { responseMimeType: 'application/json' } });
        
        const response = await withTimeout(model.generateContent(prompt), 10000);
        const text = response.response.text();
        const json = JSON.parse(text);
        const validated = PostVisitSummarySchema.parse(json);
        
        return { data: validated, status: 'success' };
      } catch (err) {
        console.warn(`[LLM Post-Visit Attempt ${attempt} Failed]:`, err);
      }
    }
  }

  // Fallback if API fails or key not set
  return {
    data: {
      patient_summary: 'AI summary unavailable — review clinical notes directly with your doctor.',
      medication_schedule: prescriptionText ? [{ medicine: 'Prescribed Medication', dosage: 'As directed', frequency: 'As specified', duration: 'As directed' }] : [],
      follow_up_steps: ['Rest well', 'Stay hydrated', 'Contact doctor if symptoms worsen']
    },
    status: 'failed'
  };
}
