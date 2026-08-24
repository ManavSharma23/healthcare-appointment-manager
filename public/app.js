const API_BASE = '';
let activeRole = 'patient';
let selectedSlotStart = null;
let activeHoldId = null;
let activeHoldSlotStart = null;
let selectedDoctorId = null;
let pendingLeaveData = null;

const tokens = {
  patient: '',
  doctor: '',
  admin: '',
};

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
    appendAuditLog('System initialized with demo credentials nominal.');
  } catch (err) {
    console.error('Initialization error:', err);
  }
}

function refreshActivePortal() {
  switchDashboard(activeRole);
}

function switchAccountRole(role) {
  document.getElementById('roleSelector').value = role;
  switchDashboard(role);
}

function switchDashboard(role) {
  activeRole = role;

  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.dashboard-panel').forEach(sec => sec.classList.remove('active'));

  document.getElementById(`${role}Dashboard`).classList.add('active');
  
  const tabIndex = role === 'patient' ? 0 : role === 'doctor' ? 1 : 2;
  document.querySelectorAll('.nav-item')[tabIndex]?.classList.add('active');

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

function appendAuditLog(message) {
  const container = document.getElementById('systemAuditLog');
  if (!container) return;
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const div = document.createElement('div');
  div.className = 'audit-item';
  div.innerHTML = `<span class="mono-code">[${time}]</span> ${message}`;
  container.prepend(div);
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
  selectedSlotStart = null;
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
  document.getElementById('slotActionPanel').classList.add('hidden');

  if (data.message) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color:var(--status-coral); font-size:0.85rem; padding:0.5rem 0;">⚠️ ${data.message}</div>`;
    return;
  }

  (data.slots || []).forEach(slot => {
    const btn = document.createElement('button');
    const timeStr = new Date(slot.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    
    const isCurrentHold = activeHoldSlotStart && new Date(slot.slot_start).getTime() === new Date(activeHoldSlotStart).getTime();
    const isSelectedLocal = selectedSlotStart && new Date(slot.slot_start).getTime() === new Date(selectedSlotStart).getTime();

    if (isCurrentHold) {
      btn.className = 'slot-ledger-btn held';
      btn.innerText = `${timeStr} (Held)`;
      btn.onclick = () => releaseCurrentHold();
      btn.title = "Click to release slot hold";
    } else if (isSelectedLocal) {
      btn.className = 'slot-ledger-btn available selected-slot-btn';
      btn.innerText = `${timeStr} ✓`;
      btn.onclick = () => selectSlotLocal(null);
    } else if (slot.available) {
      btn.className = 'slot-ledger-btn available';
      btn.innerText = timeStr;
      // FIX 1: Selecting a slot ONLY updates local state — NO API call yet!
      btn.onclick = () => selectSlotLocal(slot.slot_start);
    } else {
      btn.className = 'slot-ledger-btn disabled';
      btn.innerText = timeStr;
      btn.disabled = true;
      btn.title = "Slot Unavailable";
    }
    grid.appendChild(btn);
  });
}

// FIX 1: Local Slot Selection (No API Call)
function selectSlotLocal(slotStart) {
  selectedSlotStart = slotStart;
  const panel = document.getElementById('slotActionPanel');
  if (slotStart) {
    const timeStr = new Date(slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('selectedTimeText').innerText = `${timeStr} (5-Min Lock)`;
    panel.classList.remove('hidden');
  } else {
    panel.classList.add('hidden');
  }
  loadDoctorSlots();
}

async function releaseCurrentHold() {
  if (!activeHoldId) return;
  try {
    await fetch(`${API_BASE}/patients/appointments/${activeHoldId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokens.patient}`
      },
      body: JSON.stringify({ reason: 'Patient released slot hold' })
    });
  } catch (err) {
    console.error('Failed to cancel hold:', err);
  }
  activeHoldId = null;
  activeHoldSlotStart = null;
  document.getElementById('activeHoldSection').classList.add('hidden');
  document.getElementById('bookingMessage').innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; margin-top:0.5rem;">Slot hold released. Select any available slot to hold.</div>';
  loadDoctorSlots();
  loadPatientAppointments();
}

// FIX 1: Confirm Reserve Hold Trigger (Calls API only on explicit user click)
async function triggerReserveHold() {
  if (!selectedSlotStart || !selectedDoctorId) return;

  if (activeHoldId) {
    await releaseCurrentHold();
  }

  const slotStart = selectedSlotStart;
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
      activeHoldSlotStart = slotStart;
      selectedSlotStart = null;
      document.getElementById('slotActionPanel').classList.add('hidden');
      msgDiv.innerHTML = `<div style="color:var(--status-amber); font-weight:600; font-size:0.85rem; margin-top:0.75rem;">Slot Held for 5 Minutes. Complete symptom details below and click Confirm Booking.</div>`;
      document.getElementById('activeHoldSection').classList.remove('hidden');
      loadDoctorSlots();
      loadPatientAppointments();
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

  await fetch(`${API_BASE}/patients/appointments/${activeHoldId}/symptoms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.patient}`
    },
    body: JSON.stringify({ symptoms })
  });

  const res = await fetch(`${API_BASE}/patients/appointments/${activeHoldId}/confirm`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });

  if (res.ok) {
    alert('Appointment Confirmed. Pre-visit AI summary generated & Google Calendar synchronized.');
    appendAuditLog(`Patient Jane Doe confirmed appointment #${activeHoldId.substring(0, 8)}`);
    document.getElementById('activeHoldSection').classList.add('hidden');
    document.getElementById('symptomsInput').value = '';
    activeHoldId = null;
    activeHoldSlotStart = null;
    loadPatientAppointments();
    loadDoctorSlots();
  } else {
    alert('Failed to confirm appointment.');
  }
}

function printVisitSummary() {
  window.print();
}

function togglePastHistory() {
  const container = document.getElementById('pastHistoryContainer');
  const btn = document.getElementById('toggleHistoryBtn');
  if (container.classList.contains('hidden')) {
    container.classList.remove('hidden');
    btn.innerText = 'Hide Past & Cancelled History ▲';
  } else {
    container.classList.add('hidden');
    btn.innerText = 'View Past & Cancelled History ▼';
  }
}

// FIX 2: Restructured Appointments Feed (Active vs Collapsed Past History)
async function loadPatientAppointments() {
  const container = document.getElementById('patientAppointmentsList');
  container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Loading active appointments...</p>';

  const res = await fetch(`${API_BASE}/patients/my-appointments`, {
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });
  const data = await res.json();
  container.innerHTML = '';

  const rawAppointments = data.appointments || [];

  if (rawAppointments.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No active appointments found.</p>';
    return;
  }

  // Separate Active/Upcoming from Cancelled/Past
  const activeList = rawAppointments.filter(a => a.status === 'confirmed' || a.status === 'held' || a.status === 'completed');
  const pastList = rawAppointments.filter(a => a.status === 'cancelled');

  // Sort active chronologically (slot_start ASC)
  activeList.sort((a, b) => new Date(a.slot_start).getTime() - new Date(b.slot_start).getTime());

  if (activeList.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No upcoming active appointments.</p>';
  } else {
    activeList.forEach(appt => {
      const timeStr = new Date(appt.slot_start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const card = document.createElement('div');
      card.className = 'clinical-feed-card';
      card.innerHTML = `
        <div class="flex-between">
          <div>
            <strong style="font-size:0.95rem; color:var(--text-primary);">${appt.doctor_name}</strong>
            <div style="font-size:0.8rem; color:var(--accent-teal); font-weight:500;">${appt.specialisation}</div>
            <div class="mono-code" style="margin-top:0.2rem;">${timeStr}</div>
          </div>
          <span class="urgency-badge ${appt.status === 'confirmed' ? 'urgency-low' : appt.status === 'completed' ? 'urgency-low' : 'urgency-medium'}">${appt.status.toUpperCase()}</span>
        </div>

        ${appt.symptom_summary ? `
          <div class="clinical-triage-card">
            <div class="triage-card-header">
              <span class="triage-title">PRE-VISIT AI CLINICAL TRIAGE</span>
              <span class="urgency-badge urgency-${(appt.symptom_summary.ai_summary?.urgency || 'Medium').toLowerCase()}">Urgency: ${appt.symptom_summary.ai_summary?.urgency || 'Medium'}</span>
            </div>
            <div class="chief-complaint-text">${appt.symptom_summary.ai_summary?.chief_complaint || appt.symptom_summary.symptoms}</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.2rem;">Suggested Discussion Points for Visit:</div>
            <ol class="questions-list">
              ${(appt.symptom_summary.ai_summary?.questions || []).map(q => `<li>${q}</li>`).join('')}
            </ol>
          </div>
        ` : ''}

        ${appt.visit_note?.ai_patient_summary ? `
          <div class="clinical-triage-card" style="border-left-color:var(--status-green);">
            <div class="triage-card-header">
              <span class="triage-title" style="color:var(--status-green);">PATIENT-FRIENDLY POST-VISIT SUMMARY</span>
              <button class="btn btn-outline btn-sm" style="font-size:0.7rem; padding:0.2rem 0.5rem;" onclick="printVisitSummary()">Print Summary</button>
            </div>
            <div style="font-size:0.85rem; color:var(--text-body);">${appt.visit_note.ai_patient_summary}</div>
          </div>
        ` : ''}
      `;
      container.appendChild(card);
    });
  }

  // Collapsible Past History Section
  if (pastList.length > 0) {
    const historyWrapper = document.createElement('div');
    historyWrapper.style.marginTop = '1.5rem';
    historyWrapper.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
        <span class="section-divider-label" style="margin-bottom:0;">PAST HISTORY (${pastList.length})</span>
        <button id="toggleHistoryBtn" class="btn btn-outline btn-sm" style="font-size:0.75rem;" onclick="togglePastHistory()">View Past & Cancelled History ▼</button>
      </div>
      <div id="pastHistoryContainer" class="clinical-feed hidden"></div>
    `;
    container.appendChild(historyWrapper);

    const historyFeed = historyWrapper.querySelector('#pastHistoryContainer');
    pastList.forEach(appt => {
      const timeStr = new Date(appt.slot_start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const card = document.createElement('div');
      card.className = 'clinical-feed-card';
      card.style.opacity = '0.7';
      card.innerHTML = `
        <div class="flex-between">
          <div>
            <strong style="font-size:0.9rem; color:var(--text-muted);">${appt.doctor_name}</strong>
            <div class="mono-code" style="margin-top:0.2rem;">${timeStr}</div>
          </div>
          <span class="urgency-badge urgency-high">CANCELLED</span>
        </div>
      `;
      historyFeed.appendChild(card);
    });
  }
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
          <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.2rem;">Clinical Intake Checklist:</div>
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
    appendAuditLog(`Dr. Sarah Jenkins submitted visit notes for appointment #${appointmentId.substring(0, 8)}`);
    loadDoctorSchedule();
    loadPatientAppointments();
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
    const data = await res.json();
    alert('Doctor profile created successfully.');
    appendAuditLog(`Created doctor account: ${data.doctor?.name || name} (${specialisation})`);
    loadAdminDoctorsList();
    loadDoctors();
  } else {
    const data = await res.json();
    alert(`Error: ${data.error || 'Failed to create doctor profile.'}`);
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
    select.innerHTML += `<option value="${doc.id}" data-name="${doc.name}">${doc.name} (${doc.specialisation} - ${doc.email})</option>`;
  });
}

function triggerLeaveConfirmation(e) {
  e.preventDefault();
  const select = document.getElementById('adminLeaveDocSelect');
  const docId = select.value;
  const docName = select.options[select.selectedIndex]?.getAttribute('data-name') || 'the selected doctor';
  const date = document.getElementById('adminLeaveDate').value;
  const reason = document.getElementById('adminLeaveReason').value;

  if (!docId || !date) {
    alert('Please select a doctor and leave date.');
    return;
  }

  pendingLeaveData = { docId, docName, date, reason };
  document.getElementById('modalLeaveBodyText').innerText = 
    `Are you sure you want to schedule leave for ${docName} on ${date}? This action will immediately cancel conflicting active appointments and dispatch notification emails to affected patients.`;
  document.getElementById('leaveModal').classList.remove('hidden');
}

function closeLeaveModal() {
  pendingLeaveData = null;
  document.getElementById('leaveModal').classList.add('hidden');
}

async function confirmScheduleLeaveAction() {
  if (!pendingLeaveData) return;
  const { docId, docName, date, reason } = pendingLeaveData;
  closeLeaveModal();

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
    const cancelled = data.result?.cancelledAppointmentsCount || 0;
    alert(`Doctor leave scheduled for ${date}. ${cancelled} conflicting appointments cancelled.`);
    appendAuditLog(`Scheduled leave for ${docName} on ${date} (${cancelled} appointments cancelled)`);
    loadDoctorSchedule();
    loadPatientAppointments();
  } else {
    alert('Failed to schedule doctor leave.');
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
  appendAuditLog(`Requeued failed notification #${id.substring(0, 8)}`);
  loadFailedNotifications();
}

window.onload = init;
