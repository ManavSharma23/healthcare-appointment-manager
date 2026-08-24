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
 * Generate Pre-Visit AI Symptom Summary with Symptom-Specific Clinical Intelligence
 */
export async function generatePreVisitSummary(symptoms: string): Promise<{ data: PreVisitAiSummary; status: 'success' | 'failed' }> {
  const prompt = `Analyse these patient symptoms: "${symptoms}".
Return valid JSON with:
1. "urgency": "Low" | "Medium" | "High"
2. "chief_complaint": A concise professional medical synthesis of the chief complaint (e.g. "Acute chest pressure with radiation to arm" rather than raw copy of text).
3. "questions": 3 highly specific, clinical questions tailored explicitly to these exact symptoms (e.g., for chest pain ask about arm radiation, dyspnea, diaphoresis; for stomach pain ask about meal relation, bowel habits, nausea; for skin rash ask about itchiness, fever, new contact exposures).

Return ONLY valid JSON matching:
{
  "urgency": "Low" | "Medium" | "High",
  "chief_complaint": "Medical synthesis of symptoms",
  "questions": ["Symptom-specific Question 1", "Symptom-specific Question 2", "Symptom-specific Question 3"]
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

  // Symptom-Aware Fallback Rule Engine for local offline mode
  const lower = symptoms.toLowerCase();
  
  if (lower.includes('chest') || lower.includes('heart') || lower.includes('palpitations') || lower.includes('angina')) {
    return {
      data: {
        urgency: 'High',
        chief_complaint: 'Acute Substernal Discomfort & Potential Cardiac Pressure',
        questions: [
          'Does the chest discomfort radiate to your shoulder, arm, neck, or jaw?',
          'Are you experiencing accompanying shortness of breath, dizziness, or cold sweating?',
          'Does the discomfort intensify during physical exertion or deep inspiration?'
        ]
      },
      status: 'failed'
    };
  } else if (lower.includes('stomach') || lower.includes('abdominal') || lower.includes('belly') || lower.includes('nausea') || lower.includes('vomit')) {
    return {
      data: {
        urgency: 'Medium',
        chief_complaint: 'Gastrointestinal Distress & Abdominal Discomfort',
        questions: [
          'Is the abdominal discomfort sharp, cramping, or a dull persistent ache?',
          'Does eating meals or drinking fluids aggravate or alleviate the symptoms?',
          'Have you experienced any fever, nausea, vomiting, or altered bowel habits?'
        ]
      },
      status: 'failed'
    };
  } else if (lower.includes('head') || lower.includes('migraine') || lower.includes('dizzy') || lower.includes('vertigo')) {
    return {
      data: {
        urgency: 'Medium',
        chief_complaint: 'Cephalea & Cranial Neurological Symptoms',
        questions: [
          'Was the onset of the headache sudden and severe, like a thunderclap?',
          'Are you experiencing visual disturbances, aura, or heightened light sensitivity?',
          'Have you noticed any stiffness in your neck or weakness in your facial muscles?'
        ]
      },
      status: 'failed'
    };
  } else if (lower.includes('skin') || lower.includes('rash') || lower.includes('itch') || lower.includes('lesion')) {
    return {
      data: {
        urgency: 'Low',
        chief_complaint: 'Dermatological Rash & Cutaneous Lesion Presentation',
        questions: [
          'Is the affected skin area itchy, painful, or warm to the touch?',
          'Have you recently used new soaps, lotions, or started any new medications?',
          'Has the rash spread or changed in color over the past 24 to 48 hours?'
        ]
      },
      status: 'failed'
    };
  } else if (lower.includes('joint') || lower.includes('knee') || lower.includes('back') || lower.includes('bone') || lower.includes('muscle')) {
    return {
      data: {
        urgency: 'Low',
        chief_complaint: 'Musculoskeletal Pain & Mobility Restriction',
        questions: [
          'Did this pain start after a specific physical injury or sudden movement?',
          'Does joint swelling, redness, or morning stiffness accompany the pain?',
          'Does weight-bearing or walking significantly worsen the discomfort?'
        ]
      },
      status: 'failed'
    };
  }

  // Default fallback for general symptoms
  return {
    data: {
      urgency: 'Medium',
      chief_complaint: `General Symptom Presentation: ${symptoms.slice(0, 75)}`,
      questions: [
        `What specific onset triggers or timing patterns accompany your ${symptoms.slice(0, 30)}?`,
        'Have you taken any over-the-counter medications or home remedies for relief?',
        'Are you experiencing any accompanying fever, fatigue, or general malaise?'
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

  return {
    data: {
      patient_summary: `Your doctor reviewed your condition: ${notes}. Please follow the instructions below and rest.`,
      medication_schedule: prescriptionText ? [
        { medicine: 'Prescribed Medication', dosage: 'As directed', frequency: 'Daily', duration: '5-7 days' }
      ] : [],
      follow_up_steps: [
        'Take medications as prescribed with meals.',
        'Schedule a follow-up appointment if symptoms persist after 5 days.',
        'Seek immediate emergency care if you experience severe worsening symptoms.'
      ]
    },
    status: 'failed'
  };
}
