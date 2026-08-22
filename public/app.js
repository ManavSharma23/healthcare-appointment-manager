const API_BASE = '';
let activeRole = 'patient';
let activeHoldId = null;
let selectedDoctorId = null;

const tokens = {
  patient: '',
  doctor: '',
  admin: '',
};

// FIX ISSUE 5: Sidebar Footer Identity Chip User Names
const userDetails = {
  patient: { name: 'Jane Doe', role: 'Patient Account', email: 'patient@clinic.com' },
  doctor: { name: 'Dr. Sarah Jenkins', role: 'Doctor Workstation', email: 'doctor@clinic.com' },
  admin: { name: 'System Admin', role: 'Administration Console', email: 'admin@clinic.com' },
};

const portalTitles = {
  patient: { title: 'Patient Scheduling & Intake', sub: 'Select doctor, reserve ledger slots, and review AI clinical triages' },
  doctor: { title: 'Doctor Workstation', sub: 'Inspect daily appointment schedule, AI symptom summaries, and clinical notes' },
  admin: { title: 'Administration Console', sub: 'Manage doctor accounts, schedule leaves with conflict handling, and monitor dead-letter logs' },
};

async function init() {
  try {
    const resP = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'patient@clinic.com', password: 'password123' })
    });
    const dataP = await resP.json();
    if (dataP.accessToken) tokens.patient = dataP.accessToken;

    const resD = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@clinic.com', password: 'password123' })
    });
    const dataD = await resD.json();
    if (dataD.accessToken) tokens.doctor = dataD.accessToken;

    const resA = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@clinic.com', password: 'password123' })
    });
    const dataA = await resA.json();
    if (dataA.accessToken) tokens.admin = dataA.accessToken;

    switchDashboard('patient');
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

function refreshActivePortal() {
  switchDashboard(activeRole);
}

function switchDashboard(role) {
  activeRole = role;

  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.dashboard-panel').forEach(sec => sec.classList.remove('active'));

  document.getElementById(`${role}Dashboard`).classList.add('active');
  
  const tabIndex = role === 'patient' ? 0 : role === 'doctor' ? 1 : 2;
  document.querySelectorAll('.nav-item')[tabIndex]?.classList.add('active');

  // FIX ISSUE 5: User identity chip
  const user = userDetails[role];
  document.getElementById('currentUserName').innerText = user.name;
  document.getElementById('currentEmail').innerText = user.email;

  const headerMeta = portalTitles[role];
  document.getElementById('workspaceTitle').innerText = headerMeta.title;
  document.getElementById('workspaceSub').innerText = headerMeta.sub;

  if (role === 'patient') {
    loadDoctors();
    loadPatientAppointments();
  } else if (role === 'doctor') {
    loadDoctorSchedule();
  } else if (role === 'admin') {
    loadFailedNotifications();
    loadAdminDoctorsList();
  }
}

// PATIENT PORTAL
async function loadDoctors() {
  const spec = document.getElementById('patientSpecFilter').value;
  const res = await fetch(`${API_BASE}/patients/doctors?specialisation=${encodeURIComponent(spec)}`, {
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });
  const data = await res.json();
  
  const container = document.getElementById('doctorList');
  container.innerHTML = '';

  const doctors = data.doctors || [];

  doctors.forEach(doc => {
    const div = document.createElement('div');
    div.className = 'doctor-ledger-item';
    div.innerHTML = `
      <div>
        <div class="doc-name">${doc.name}</div>
        <div class="doc-spec">${doc.specialisation}</div>
        <div class="doc-meta">Hours: ${doc.working_hours.start} - ${doc.working_hours.end} | ${doc.slot_duration_min} min slots</div>
      </div>
      <button class="btn btn-teal btn-sm" onclick="selectDoctor('${doc.id}', '${doc.name}')">View Time Slots</button>
    `;
    container.appendChild(div);
  });
}

function selectDoctor(id, name) {
  selectedDoctorId = id;
  document.getElementById('selectedDoctorName').innerText = name;
  document.getElementById('slotPickerSection').classList.remove('hidden');
  document.getElementById('bookingDate').valueAsDate = new Date();
  loadDoctorSlots();
}

async function loadDoctorSlots() {
  if (!selectedDoctorId) return;
  const date = document.getElementById('bookingDate').value;
  const res = await fetch(`${API_BASE}/patients/doctors/${selectedDoctorId}/slots?date=${date}`, {
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });
  const data = await res.json();

  const grid = document.getElementById('slotGrid');
  grid.innerHTML = '';

  if (data.message) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color:var(--status-coral); font-size:0.85rem; padding:0.5rem 0;">⚠️ ${data.message}</div>`;
    return;
  }

  (data.slots || []).forEach(slot => {
    const btn = document.createElement('button');
    const timeStr = new Date(slot.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    btn.className = `slot-ledger-btn ${slot.available ? 'available' : 'disabled'}`;
    btn.innerText = timeStr;
    if (slot.available) {
      btn.onclick = () => holdSlot(slot.slot_start);
    } else {
      btn.disabled = true;
      btn.title = "Slot Unavailable";
    }
    grid.appendChild(btn);
  });
}

async function holdSlot(slotStart) {
  const msgDiv = document.getElementById('bookingMessage');
  msgDiv.innerHTML = '';

  try {
    const res = await fetch(`${API_BASE}/patients/appointments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.patient}`
      },
      body: JSON.stringify({ doctorId: selectedDoctorId, slotStart })
    });
    const data = await res.json();

    if (res.ok) {
      activeHoldId = data.appointment.id;
      msgDiv.innerHTML = `<div style="color:var(--status-amber); font-weight:600; font-size:0.85rem; margin-top:0.75rem;">Slot Held for 5 Minutes. Enter symptoms below to confirm.</div>`;
      document.getElementById('activeHoldSection').classList.remove('hidden');
      loadDoctorSlots();
    } else {
      msgDiv.innerHTML = `<div style="color:var(--status-coral); font-weight:600; font-size:0.85rem; margin-top:0.75rem;">${data.error || 'Slot no longer available'}</div>`;
      loadDoctorSlots();
    }
  } catch (err) {
    msgDiv.innerHTML = `<div style="color:var(--status-coral);">Network Connection Error</div>`;
  }
}

async function submitSymptomsAndConfirm() {
  if (!activeHoldId) return;
  const symptoms = document.getElementById('symptomsInput').value;
  if (!symptoms || symptoms.length < 5) {
    alert('Please describe patient symptoms (minimum 5 characters).');
    return;
  }

  // 1. Submit Symptoms (Triggers Pre-Visit AI Analysis)
  await fetch(`${API_BASE}/patients/appointments/${activeHoldId}/symptoms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.patient}`
    },
    body: JSON.stringify({ symptoms })
  });

  // 2. Confirm Appointment
  const res = await fetch(`${API_BASE}/patients/appointments/${activeHoldId}/confirm`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });

  if (res.ok) {
    alert('Appointment Confirmed. Pre-visit AI summary generated & Google Calendar synchronized.');
    document.getElementById('activeHoldSection').classList.add('hidden');
    document.getElementById('symptomsInput').value = '';
    activeHoldId = null;
    loadPatientAppointments();
  } else {
    alert('Failed to confirm appointment.');
  }
}

async function loadPatientAppointments() {
  const container = document.getElementById('patientAppointmentsList');
  container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Loading active appointments...</p>';

  const res = await fetch(`${API_BASE}/doctors/appointments`, {
    headers: { 'Authorization': `Bearer ${tokens.doctor}` }
  });
  const data = await res.json();
  container.innerHTML = '';

  const rawAppointments = data.appointments || [];
  const appointments = rawAppointments.filter(a => a.status === 'confirmed' || a.status === 'completed' || a.status === 'held');

  if (appointments.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No active appointments found.</p>';
    return;
  }

  appointments.forEach(appt => {
    const timeStr = new Date(appt.slot_start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const card = document.createElement('div');
    card.className = 'clinical-feed-card';
    card.innerHTML = `
      <div class="flex-between">
        <div>
          <strong style="font-size:0.95rem; color:var(--text-primary);">Doctor Visit</strong>
          <div class="mono-code" style="margin-top:0.2rem;">${timeStr}</div>
        </div>
        <span class="urgency-badge ${appt.status === 'confirmed' ? 'urgency-low' : 'urgency-medium'}">${appt.status.toUpperCase()}</span>
      </div>

      ${appt.symptom_summary ? `
        <div class="clinical-triage-card">
          <div class="triage-card-header">
            <span class="triage-title">PRE-VISIT AI CLINICAL TRIAGE</span>
            <span class="urgency-badge urgency-${(appt.symptom_summary.ai_summary?.urgency || 'Medium').toLowerCase()}">Urgency: ${appt.symptom_summary.ai_summary?.urgency || 'Medium'}</span>
          </div>
          <div class="chief-complaint-text">${appt.symptom_summary.ai_summary?.chief_complaint || appt.symptom_summary.symptoms}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.2rem;">Suggested Clinical Questions:</div>
          <ol class="questions-list">
            ${(appt.symptom_summary.ai_summary?.questions || []).map(q => `<li>${q}</li>`).join('')}
          </ol>
        </div>
      ` : ''}

      ${appt.visit_note?.ai_patient_summary ? `
        <div class="clinical-triage-card" style="border-left-color:var(--status-green);">
          <div class="triage-card-header">
            <span class="triage-title" style="color:var(--status-green);">PATIENT-FRIENDLY POST-VISIT SUMMARY</span>
          </div>
          <div style="font-size:0.85rem; color:var(--text-body);">${appt.visit_note.ai_patient_summary}</div>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

// DOCTOR WORKSTATION
async function loadDoctorSchedule() {
  const date = document.getElementById('doctorFilterDate').value;
  const res = await fetch(`${API_BASE}/doctors/appointments?date=${date || ''}`, {
    headers: { 'Authorization': `Bearer ${tokens.doctor}` }
  });
  const data = await res.json();

  const container = document.getElementById('doctorAppointmentsList');
  container.innerHTML = '';

  const rawAppointments = data.appointments || [];

  // FIX ISSUE 3: Update Doctor Schedule Summary Panel stats
  const totalSlots = rawAppointments.length;
  const confirmedCount = rawAppointments.filter(a => a.status === 'confirmed' || a.status === 'completed').length;
  const urgentCount = rawAppointments.filter(a => a.symptom_summary?.ai_summary?.urgency === 'High' || a.symptom_summary?.ai_summary?.urgency === 'Medium').length;
  
  document.getElementById('docTotalSlots').innerText = totalSlots;
  document.getElementById('docConfirmedCount').innerText = confirmedCount;
  document.getElementById('docUrgentCount').innerText = urgentCount;

  const nextAppt = rawAppointments.find(a => a.status === 'confirmed');
  const nextBox = document.getElementById('docNextAppointmentBox');
  if (nextAppt) {
    const timeStr = new Date(nextAppt.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    nextBox.innerHTML = `
      <div style="font-family:var(--font-header); font-weight:600; color:var(--text-primary);"><span class="mono-code">${timeStr}</span> ${nextAppt.patient_name}</div>
      <div style="font-size:0.8rem; color:var(--text-muted);">${nextAppt.patient_email}</div>
      <div style="font-size:0.75rem; color:var(--accent-teal); margin-top:0.25rem;">Confirmed Visit</div>
    `;
  } else {
    nextBox.innerHTML = `<div style="font-size:0.85rem; color:var(--text-muted);">No confirmed upcoming visits for this date filter.</div>`;
  }

  if (rawAppointments.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">No appointments scheduled for this date.</p>';
    return;
  }

  rawAppointments.forEach(appt => {
    const timeStr = new Date(appt.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const div = document.createElement('div');
    div.className = 'clinical-feed-card';
    
    const canSubmitNotes = appt.status === 'confirmed';
    const isCompleted = appt.status === 'completed';
    const isCancelled = appt.status === 'cancelled';

    div.innerHTML = `
      <div class="flex-between">
        <div>
          <h4 style="font-family:var(--font-header); font-size:1.05rem; font-weight:700; color:var(--text-primary);"><span class="mono-code">${timeStr}</span> ${appt.patient_name}</h4>
          <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-muted);">${appt.patient_email}</div>
        </div>
        <span class="urgency-badge ${appt.status === 'confirmed' ? 'urgency-low' : appt.status === 'completed' ? 'urgency-low' : 'urgency-high'}">${appt.status.toUpperCase()}</span>
      </div>
      
      ${appt.symptom_summary ? `
        <div class="clinical-triage-card">
          <div class="triage-card-header">
            <span class="triage-title">PRE-VISIT AI CLINICAL TRIAGE</span>
            <span class="urgency-badge urgency-${(appt.symptom_summary.ai_summary?.urgency || 'Medium').toLowerCase()}">${appt.symptom_summary.ai_summary?.urgency || 'Medium'} Urgency</span>
          </div>
          <div class="chief-complaint-text">${appt.symptom_summary.ai_summary?.chief_complaint || appt.symptom_summary.symptoms}</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.2rem;">Suggested Questions for Doctor:</div>
          <ol class="questions-list">
            ${(appt.symptom_summary.ai_summary?.questions || []).map(q => `<li>${q}</li>`).join('')}
          </ol>
        </div>
      ` : '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem;">No pre-visit symptoms submitted.</div>'}

      ${canSubmitNotes ? `
        <div style="margin-top:1rem; padding-top:1rem; border-top:1px solid var(--border-color);">
          <label class="clinical-label">Submit Post-Visit Clinical Notes & Prescription</label>
          <div class="form-group">
            <textarea id="notes_${appt.id}" rows="2" placeholder="Clinical diagnosis and notes..."></textarea>
          </div>
          <button class="btn btn-teal" onclick="submitPostVisitNotes('${appt.id}')">Submit Clinical Notes & Complete Visit</button>
        </div>
      ` : isCompleted ? `
        <div class="clinical-triage-card" style="border-left-color:var(--status-green);">
          <div class="triage-card-header">
            <span class="triage-title" style="color:var(--status-green);">PATIENT-FRIENDLY POST-VISIT SUMMARY</span>
          </div>
          <div style="font-size:0.85rem;">${appt.visit_note?.ai_patient_summary || 'N/A'}</div>
        </div>
      ` : isCancelled ? `
        <div style="font-size:0.8rem; color:var(--status-coral); margin-top:0.5rem; font-weight:600;">
          Appointment Cancelled — No Visit Notes Permitted
        </div>
      ` : ''}
    `;
    container.appendChild(div);
  });
}

async function submitPostVisitNotes(appointmentId) {
  const notes = document.getElementById(`notes_${appointmentId}`).value;
  if (!notes) {
    alert('Please enter clinical notes.');
    return;
  }

  const res = await fetch(`${API_BASE}/doctors/appointments/${appointmentId}/notes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.doctor}`
    },
    body: JSON.stringify({
      doctor_notes: notes,
      prescription: [{ medicine: 'Amoxicillin 500mg', dosage: '1 tablet', frequency: 'twice daily', duration: '5 days' }]
    })
  });

  if (res.ok) {
    alert('Clinical notes submitted. Post-visit AI summary generated & medication reminders scheduled.');
    loadDoctorSchedule();
  } else {
    const errData = await res.json();
    alert(`Error: ${errData.error || 'Failed to submit clinical notes'}`);
  }
}

// ADMIN CONSOLE
async function handleCreateDoctor(e) {
  e.preventDefault();
  const name = document.getElementById('adminDocName').value;
  const email = document.getElementById('adminDocEmail').value;
  const password = document.getElementById('adminDocPass').value;
  const specialisation = document.getElementById('adminDocSpec').value;

  const res = await fetch(`${API_BASE}/admin/doctors`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.admin}`
    },
    body: JSON.stringify({ name, email, password, specialisation })
  });

  if (res.ok) {
    alert('Doctor profile created successfully.');
    loadAdminDoctorsList();
    loadDoctors();
  } else {
    alert('Failed to create doctor profile.');
  }
}

async function loadAdminDoctorsList() {
  const res = await fetch(`${API_BASE}/patients/doctors`, {
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });
  const data = await res.json();
  const select = document.getElementById('adminLeaveDocSelect');
  select.innerHTML = '';
  const doctors = data.doctors || [];
  doctors.forEach(doc => {
    select.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialisation})</option>`;
  });
}

async function handleScheduleLeave(e) {
  e.preventDefault();
  const docId = document.getElementById('adminLeaveDocSelect').value;
  const date = document.getElementById('adminLeaveDate').value;
  const reason = document.getElementById('adminLeaveReason').value;

  const res = await fetch(`${API_BASE}/admin/doctors/${docId}/leave`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.admin}`
    },
    body: JSON.stringify({ date, reason })
  });

  if (res.ok) {
    const data = await res.json();
    alert(`Doctor leave scheduled for ${date}. ${data.result?.cancelledAppointmentsCount || 0} conflicting appointments cancelled.`);
    loadDoctorSchedule();
    loadPatientAppointments();
  }
}

async function loadFailedNotifications() {
  const res = await fetch(`${API_BASE}/admin/notifications/failed`, {
    headers: { 'Authorization': `Bearer ${tokens.admin}` }
  });
  const data = await res.json();

  const container = document.getElementById('failedNotificationsList');
  container.innerHTML = '';

  if (!data.failedNotifications || data.failedNotifications.length === 0) {
    // FIX MINOR POLISH: Structured Empty State Box for Failed Notifications
    container.innerHTML = `
      <div class="empty-state-box">
        <div style="font-family:var(--font-header); font-weight:600; color:var(--text-primary); margin-bottom:0.25rem;">Dead-Letter Queue Nominal</div>
        <div>All event notifications delivered cleanly. Zero failed jobs.</div>
      </div>
    `;
    return;
  }

  data.failedNotifications.forEach(notif => {
    const div = document.createElement('div');
    div.className = 'clinical-feed-card flex-between';
    div.innerHTML = `
      <div>
        <strong style="color:var(--status-coral);">${notif.type.toUpperCase()}</strong> (${notif.channel})<br>
        <small style="font-family:var(--font-mono); color:var(--text-muted);">User: ${notif.user?.email || 'N/A'} | Retries: ${notif.retry_count}/3</small>
      </div>
      <button class="btn btn-outline btn-sm" onclick="retryFailedNotification('${notif.id}')">Retry Delivery</button>
    `;
    container.appendChild(div);
  });
}

async function retryFailedNotification(id) {
  await fetch(`${API_BASE}/admin/notifications/${id}/retry`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.admin}` }
  });
  alert('Notification requeued for retry.');
  loadFailedNotifications();
}

window.onload = init;
