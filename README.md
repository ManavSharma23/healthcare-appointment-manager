# Healthcare Appointment & Follow-up Manager

A production-grade, full-stack Healthcare Appointment Platform featuring 3 distinct portals (**Patient**, **Doctor**, **Admin**), AI-assisted pre-visit & post-visit summaries, concurrency-safe slot holds, event-driven email notifications, Google Calendar synchronization, and background medication reminders.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- Node.js (v18+) & npm

### 2. Installation
```bash
git clone <repository-url>
cd HealthCare-App
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default `.env` configuration works out-of-the-box with zero setup required using SQLite!

### 4. Database Setup & Seeding
```bash
npx prisma db push
npx tsx src/seed.ts
```

### 5. Running the Application
```bash
npm run dev
```
Open **`http://localhost:4000`** in your browser to view the interactive application dashboard!

Default Seed Credentials for instant testing:
- **Admin Portal**: `admin@clinic.com` / `password123`
- **Doctor Portal**: `doctor@clinic.com` / `password123`
- **Patient Portal**: `patient@clinic.com` / `password123`

---

## 🧪 Running Automated Concurrency Tests
Run the mandatory 10-parallel-request slot hold concurrency test:
```bash
npx vitest run tests/concurrency.test.ts
```
**Test Result**: 10 parallel booking requests executed against the identical doctor slot → **Exactly 1 succeeds** and **9 fail safely** with `Slot no longer available` (HTTP 409).

---

## 📖 API Documentation

| Method | Endpoint | Access Role | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register new user account |
| `POST` | `/auth/login` | Public | Login & obtain JWT access + refresh tokens |
| `POST` | `/auth/refresh` | Public | Rotate refresh token for new access token |
| `GET` | `/patients/doctors` | Patient | Search doctors by specialisation |
| `GET` | `/patients/doctors/:id/slots` | Patient | Get available doctor slots for a date |
| `POST` | `/patients/appointments` | Patient | Create a 5-min transactional slot hold |
| `POST` | `/patients/appointments/:id/confirm` | Patient | Confirm held appointment |
| `POST` | `/patients/appointments/:id/cancel` | Patient | Cancel appointment |
| `POST` | `/patients/appointments/:id/symptoms` | Patient | Submit pre-visit symptoms (triggers Pre-Visit AI) |
| `GET` | `/patients/appointments/:id/summary` | Patient | View post-visit summary & prescription |
| `GET` | `/doctors/appointments` | Doctor | View doctor's daily schedule & pre-visit AI summaries |
| `POST` | `/doctors/appointments/:id/notes` | Doctor | Submit post-visit notes (triggers Post-Visit AI) |
| `POST` | `/admin/doctors` | Admin | Create doctor profile |
| `POST` | `/admin/doctors/:id/leave` | Admin | Mark doctor leave date (cancels & notifies affected patients) |
| `GET` | `/admin/notifications/failed` | Admin | View failed notifications in dead-letter log |
| `POST` | `/admin/notifications/:id/retry` | Admin | Manually retry failed notification |
| `GET` | `/health` | Public | Application health check endpoint |

---

## 🤖 Verbatim LLM Prompts

### Pre-Visit Symptom Analysis Prompt
> `"Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"`

### Post-Visit Patient Summary Prompt
> `"Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"`

---

## 📅 Google Calendar OAuth 2.0 Setup Guide

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project named **HealthCare App**.
3. Enable the **Google Calendar API** under API & Services.
4. Navigate to **OAuth consent screen** and select **External**. Configure required app name and support email.
5. Create credentials -> **OAuth 2.0 Client IDs**:
   - Application Type: Web Application
   - Authorized Redirect URI: `http://localhost:4000/auth/google/callback`
6. Copy the generated `Client ID` and `Client Secret` into your `.env` file under `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## 🏛️ System Architecture Summary
See complete design details in [`SYSTEM_DESIGN.md`](file:///Users/nehasharma/HealthCare-App/SYSTEM_DESIGN.md).
