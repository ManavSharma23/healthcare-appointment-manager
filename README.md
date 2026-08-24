# PulseCare — Clinical Appointment & Operations Platform

A production-grade, full-stack Healthcare Appointment Platform featuring 5 specialized role-based workspaces (**Patient**, **Doctor**, **Admin**, **Insights & Analytics**, **⚡ Super Admin / Developer Workstation**), AI-assisted clinical triages, high-contrast Light/Dark mode themes, atomic 5-minute concurrency slot holds, event-driven notifications, Google Calendar synchronization, patient medical file drawers, and system audit log exports.

---

## 🌟 Key Features & Workspaces

### 1. 👤 Patient Scheduling & Intake Workspace
- **Doctor Directory & Ledger**: Real-time slot availability filterable by clinical specialization.
- **5-Minute Atomic Slot Holds**: Transactional concurrency locking preventing double-booking during checkout.
- **Structured LLM Symptom Triage**: Instant AI pre-visit clinical triage with symptom-specific discussion points and urgency classification (*High*, *Medium*, *Low*).
- **Patient Medical Record Drawer**: Access complete consultation history, prescribed medications, and 1-click PDF medical file exports.

### 2. 🩺 Doctor Workstation
- **Clinical Daily Ledger**: View scheduled, confirmed, and completed visits with date filters.
- **AI Pre-Visit Summaries**: Instant clinical intake checklists generated from patient symptom inputs.
- **Post-Visit Notes Engine**: Doctor clinical note submission with automatic patient-friendly summary generation.
- **Clinic Shift & Break Time Scheduler**: Configure morning/afternoon shifts and auto-blocked lunch breaks (`13:00-14:00`).

### 3. 🛡️ Administration Console
- **Doctor Account Provisioning**: Create and manage doctor profiles and credentials.
- **Automated Conflict Leave Manager**: Schedule doctor leave dates with automatic appointment cancellation and patient notification dispatch.
- **Dead-Letter Notification Queue**: Inspect failed email/SMS jobs with manual retry triggers and background audit activity logging.

### 4. 📊 Insights & Clinical Analytics Workspace
- **7-Day Appointment Booking Volume**: Daily patient intake bar chart with peak-day highlighting and daily averages.
- **Clinical Specialization Demand**: Department workload distribution bars linked to individual doctor assignments.
- **No-Show & Attendance Intelligence**: Utilization metrics, completion rates, 7.1% cancellation rate tracking, and average consultation duration (`24m`).
- **Pre-Visit Triage Urgency Spread**: SVG ring indicators and aggregate triage severity distribution bars.

### 5. ⚡ Super Admin & Developer Workstation (Elevated Access Mode)
- **Real-Time System Engine Status**: Database pool connection monitors, active slot hold counters, worker queue health, and 99.98% uptime metrics.
- **Atomic Slot Hold Purge Engine**: Clean up orphaned or expired holds with zero patient investment.
- **API Health & Webhook Monitor**: Live status check for Google Calendar sync webhooks, SMTP email queue, and Gemini LLM pipeline.
- **Full Compliance Audit Trail**: Searchable, filterable audit log viewer with date-range filters, role filtering, sorting, and 1-click **CSV Export**.

---

## 🎨 Design & Accessibility Features

- **🌓 Dark / Light Mode Theme Engine**: 1-click theme switcher in the top header with high-contrast Dark Mode overrides for slot buttons, form controls, and AI clinical cards.
- **🔔 Real-Time Notification & Sound Alert System**: Header notification bell popover feed with sound alert engine (`playAlertSound()`) on booking events.
- **🔍 Global Cross-View Search Bar**: Instant search across patients, doctors, specializations, and time slots.
- **👤 Profile Session Switcher**: Avatar initials circle in the sidebar footer supporting instant role context switching.

---

## 🚀 Quick Setup Guide

### 1. Prerequisites
- **Node.js**: v18+ & npm

### 2. Installation
```bash
git clone https://github.com/ManavSharma23/healthcare-appointment-manager.git
cd HealthCare-App
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*The default `.env` configuration works out-of-the-box using SQLite with zero external database configuration required!*

### 4. Database Setup & Seeding
```bash
npx prisma db push
npx tsx src/seed.ts
```

### 5. Running Locally
```bash
npm run dev
```
Open **`http://localhost:4000`** in your browser to launch the application.

#### Default Demo Credentials
- **Patient Workspace**: `patient@clinic.com` / `password123`
- **Doctor Workstation**: `doctor@clinic.com` / `password123`
- **Administration Console**: `admin@clinic.com` / `password123`
- **Super Admin Key**: `superadmin123` *(Entered via Elevated Access modal)*

---

## 🗄️ Database Schema & Data Models

- **`User`**: Base user entity storing authentication credentials, role (`patient` \| `doctor` \| `admin`), and relationships.
- **`DoctorProfile`**: Extended doctor Metadata (clinical specialisation, working hours JSON, 30-min slot duration, active/deactivated state).
- **`DoctorLeave`**: Scheduled leave dates (`YYYY-MM-DD`) with cancellation reason.
- **`Appointment`**: Central booking ledger record (`held` \| `confirmed` \| `cancelled` \| `completed`) with 5-minute `expires_at` hold timestamp.
- **`SymptomForm`**: Pre-visit symptom intake text and structured LLM triage JSON (`urgency`, `chief_complaint`, `questions`).
- **`VisitNote`**: Post-visit clinical notes, JSON prescriptions, and patient-friendly AI summaries.
- **`MedicationReminder`**: Scheduled medication intake frequency and background dispatch timestamps.
- **`Notification`**: Email/SMS notification logs with retry counters (`pending` \| `sent` \| `failed` dead-letter queue).
- **`CalendarEvent` / `CalendarToken`**: OAuth 2.0 Google Calendar event synchronization mapping.
- **`AuditLog`**: System compliance audit trail with role, action, and timestamp indexing.

---

## 🤖 Verbatim LLM Prompts & Fallback Engine

### 1. Pre-Visit Symptom Analysis Prompt
> `"Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: <symptoms>"`

### 2. Post-Visit Patient Summary Prompt
> `"Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: <notes>"`

*Note: In offline environments or API timeout events, the application automatically triggers symptom-specific fallback triage generators (Cardiac, Gastrointestinal, Neurological, Orthopedic, Dermatological).*

---

## 📅 Google Calendar OAuth 2.0 Setup Guide

1. Navigate to the **[Google Cloud Console](https://console.cloud.google.com/)**.
2. Create a new project named **PulseCare Appointment Manager**.
3. Enable the **Google Calendar API** under **APIs & Services**.
4. Go to **OAuth consent screen**, select **External**, and configure the app name and support email.
5. Create credentials $\rightarrow$ **OAuth 2.0 Client IDs**:
   - **Application Type**: Web Application
   - **Authorized Redirect URI**: `http://localhost:4000/auth/google/callback`
6. Copy the generated `Client ID` and `Client Secret` into your `.env` file under `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

---

## 🧪 Running Concurrency & Integration Tests

Run the 10-parallel-request slot hold concurrency test:
```bash
npx vitest run tests/concurrency.test.ts
```
**Expected Result**: 10 parallel booking requests executed against the identical slot → **Exactly 1 succeeds** and **9 fail safely** with `Slot no longer available` (HTTP 409 Conflict).

---

## 📖 API Endpoint Reference

| Method | Endpoint | Access Role | Description |
|---|---|---|---|
| `POST` | `/auth/register` | Public | Register new user account |
| `POST` | `/auth/login` | Public | Login & obtain JWT access + refresh tokens |
| `POST` | `/auth/refresh` | Public | Rotate refresh token for new access token |
| `GET` | `/patients/doctors` | Patient | Search doctors by clinical specialization |
| `GET` | `/patients/doctors/:id/slots` | Patient | Get available ledger slots for a date |
| `POST` | `/patients/appointments` | Patient | Create a 5-minute atomic slot hold |
| `POST` | `/patients/appointments/:id/confirm` | Patient | Confirm held appointment reservation |
| `POST` | `/patients/appointments/:id/cancel` | Patient | Cancel appointment |
| `POST` | `/patients/appointments/:id/symptoms` | Patient | Submit symptoms (triggers LLM Triage) |
| `GET` | `/patients/appointments/:id/summary` | Patient | View post-visit summary & prescriptions |
| `GET` | `/doctors/appointments` | Doctor | View doctor schedule & AI intake checklists |
| `POST` | `/doctors/appointments/:id/notes` | Doctor | Submit post-visit notes (triggers Patient Summary) |
| `POST` | `/admin/doctors` | Admin | Create doctor account profile |
| `POST` | `/admin/doctors/:id/leave` | Admin | Schedule doctor leave (auto-cancels & notifies) |
| `GET` | `/superadmin/audit-logs` | Super Admin | Query system audit logs with filters & pagination |
| `GET` | `/superadmin/audit-logs/export` | Super Admin | Download filtered audit logs as CSV file |
| `POST` | `/superadmin/holds/purge` | Super Admin | Purge expired/orphaned slot holds |
| `GET` | `/admin/notifications/failed` | Admin | View dead-letter notification queue |
| `POST` | `/admin/notifications/:id/retry` | Admin | Retry failed notification dispatch |
| `GET` | `/health` | Public | System engine & database health status |

---

## 🛡️ Security & Operational Control

- **Elevated Session Lock**: Super Admin Workstation access requires a master security key with a 15-minute expiration timer.
- **Doctor Soft-Delete Protection**: Prevents permanent purge of doctor accounts that have past patient visit history.
- **Audit Compliance Engine**: All sensitive actions (leave scheduling, hold purges, session elevation) produce immutable audit records.

---

## 📄 License

This project is open-source under the MIT License.
