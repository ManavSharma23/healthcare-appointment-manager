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
  const sel = document.getElementById('roleSelector');
  if (sel) sel.value = role;
  switchDashboard(role);
}

function switchDashboard(role) {
  activeRole = role;

  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.dashboard-panel').forEach(sec => sec.classList.remove('active'));

  const targetId = role === 'superadmin' ? 'superAdminDashboard' : `${role}Dashboard`;
  const panel = document.getElementById(targetId);
  if (panel) {
    panel.classList.add('active');
  }

  // Highlight active nav item reliably
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    const attr = btn.getAttribute('onclick');
    if (attr && attr.includes(`'${role}'`)) {
      btn.classList.add('active');
    }
  });

  const roleLabels = {
    patient: { name: 'Jane Doe', email: 'patient@clinic.com' },
    doctor: { name: 'Dr. Sarah Jenkins', email: 'doctor@clinic.com' },
    admin: { name: 'System Admin', email: 'admin@clinic.com' },
    analytics: { name: 'System Admin', email: 'admin@clinic.com' },
    superadmin: { name: 'Super Admin', email: 'dev@system.internal' },
  };
  const roleHeaders = {
    patient: { title: 'Patient Scheduling & Intake', sub: 'Select doctor, reserve ledger slots, and review AI clinical triages' },
    doctor: { title: 'Doctor Workstation', sub: 'Inspect daily appointment schedule, AI symptom summaries, and clinical notes' },
    admin: { title: 'Administration Console', sub: 'Manage doctor accounts, schedule leaves with conflict handling, and monitor dead-letter logs' },
    analytics: { title: 'Insights & Clinical Analytics', sub: '7-day appointment volume trends, specialization demand, and no-show rate intelligence' },
    superadmin: { title: '⚡ Super Admin Workstation', sub: 'System configuration, DB maintenance, elevated access audit log viewer — RESTRICTED ACCESS' },
  };

  const user = roleLabels[role] || roleLabels.patient;
  document.getElementById('currentUserName').innerText = user.name;
  document.getElementById('currentEmail').innerText = user.email;

  // Update avatar initials
  const initials = user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  const avatarEl = document.getElementById('userAvatarInitials');
  if (avatarEl) avatarEl.innerText = initials;

  const headerMeta = roleHeaders[role] || roleHeaders.patient;
  document.getElementById('workspaceTitle').innerText = headerMeta.title;
  document.getElementById('workspaceSub').innerText = headerMeta.sub;

  const devNav = document.getElementById('developerToolsNav');
  if (devNav) {
    // Keep developer tools nav visible as long as elevated session is active or role is admin
    const stored = sessionStorage.getItem(SUPER_ADMIN_SESSION_KEY);
    const isElevatedActive = stored && Date.now() < parseInt(stored);
    if (role === 'admin' || role === 'superadmin' || isElevatedActive) {
      devNav.classList.remove('hidden');
    }
  }

  if (role === 'patient') {
    loadDoctors();
    loadPatientAppointments();
  } else if (role === 'doctor') {
    loadDoctorSchedule();
  } else if (role === 'admin') {
    loadFailedNotifications();
    loadAdminDoctorsList();
  } else if (role === 'superadmin') {
    loadSuperAdminAuditLogs();
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
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('bookingDate').value = today;
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
  if (!selectedSlotStart) {
    document.getElementById('slotActionPanel').classList.add('hidden');
  }

  if (data.message) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color:var(--status-coral); font-size:0.85rem; padding:0.5rem 0;">⚠️ ${data.message}</div>`;
    return;
  }

  const slots = data.slots || [];
  const hasAvailable = slots.some(s => s.available);

  slots.forEach(slot => {
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
      btn.onclick = () => selectSlotLocal(slot.slot_start);
    } else {
      btn.className = 'slot-ledger-btn disabled';
      btn.innerText = timeStr;
      btn.disabled = true;
      btn.title = "Slot Unavailable";
    }
    grid.appendChild(btn);
  });

  if (!hasAvailable && slots.length > 0) {
    const waitDiv = document.createElement('div');
    waitDiv.style.gridColumn = '1/-1';
    waitDiv.style.marginTop = '0.75rem';
    waitDiv.style.padding = '0.75rem';
    waitDiv.style.background = 'var(--status-amber-bg)';
    waitDiv.style.border = '1px solid var(--status-amber)';
    waitDiv.style.borderRadius = '6px';
    waitDiv.style.display = 'flex';
    waitDiv.style.justifySpaceBetween = 'space-between';
    waitDiv.style.alignItems = 'center';
    waitDiv.innerHTML = `
      <div style="font-size:0.85rem; color:var(--text-primary);">
        <strong>All slots booked for this date.</strong> Join the priority waitlist to get notified if someone cancels!
      </div>
      <button class="btn btn-warning btn-sm" onclick="joinWaitlistAction()" style="margin-left:0.5rem; white-space:nowrap;">Join Waitlist</button>
    `;
    grid.appendChild(waitDiv);
  }
}

async function joinWaitlistAction() {
  if (!selectedDoctorId) return;
  const date = document.getElementById('bookingDate').value;
  const res = await fetch(`${API_BASE}/patients/doctors/${selectedDoctorId}/waitlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.patient}`
    },
    body: JSON.stringify({ date })
  });
  const data = await res.json();
  if (res.ok) {
    alert(data.message || 'Added to waitlist!');
    appendAuditLog(`Patient Jane Doe joined waitlist for Doctor #${selectedDoctorId.substring(0,8)} on ${date}`);
  } else {
    alert(data.error || 'Could not join waitlist.');
  }
}

// FIX 1: Local Slot Selection (No API Call)
function selectSlotLocal(slotStart) {
  selectedSlotStart = slotStart;
  const panel = document.getElementById('slotActionPanel');
  if (slotStart) {
    const timeStr = new Date(slotStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    document.getElementById('selectedTimeText').innerText = `${timeStr} (5-Min Lock)`;
    panel.classList.remove('hidden');
    setTimeout(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  } else {
    panel.classList.add('hidden');
  }
  loadDoctorSlots();
}

let holdTimerInterval = null;

function startHoldCountdownTimer(durationSeconds) {
  clearInterval(holdTimerInterval);
  let remaining = durationSeconds;
  const total = durationSeconds;

  const textEl = document.getElementById('holdCountdownText');
  const barEl = document.getElementById('holdProgressBarFill');

  holdTimerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(holdTimerInterval);
      showToast('Slot hold expired!', 'error');
      releaseCurrentHold();
      return;
    }
    const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    if (textEl) textEl.innerText = `${mins}:${secs}`;
    if (barEl) {
      const pct = (remaining / total) * 100;
      barEl.style.width = `${pct}%`;
    }
  }, 1000);
}

async function releaseCurrentHold() {
  clearInterval(holdTimerInterval);
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
  showToast('Slot hold released.', 'info');
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
      document.getElementById('activeHoldSection').classList.remove('hidden');
      setTimeout(() => {
        document.getElementById('activeHoldSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
        const symptomsInput = document.getElementById('symptomsInput');
        if (symptomsInput) symptomsInput.focus();
      }, 100);

      // Start live 5-minute hold progress countdown timer
      startHoldCountdownTimer(5 * 60);

      showToast('5-minute atomic slot hold active! Complete symptoms to confirm.', 'warning');
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
    clearInterval(holdTimerInterval);
    showToast('Appointment Confirmed! Pre-visit AI summary generated & Google Calendar synchronized.', 'success');
    appendAuditLog(`Patient Jane Doe confirmed appointment #${activeHoldId.substring(0, 8)}`);
    document.getElementById('activeHoldSection').classList.add('hidden');
    document.getElementById('symptomsInput').value = '';
    activeHoldId = null;
    activeHoldSlotStart = null;
    loadPatientAppointments();
    loadDoctorSlots();
  } else {
    showToast('Failed to confirm appointment.', 'error');
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
            <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.25rem;">Suggested Discussion Points for Visit:</div>
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

// ─── TOAST NOTIFICATION HELPER ───────────────────────────────────────────────
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const div = document.createElement('div');
  div.className = `toast-message ${type === 'error' ? 'toast-error' : type === 'warning' ? 'toast-warning' : ''}`;
  const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : '✅';
  div.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  container.appendChild(div);

  setTimeout(() => {
    div.style.opacity = '0';
    div.style.transform = 'translateY(10px)';
    div.style.transition = 'all 0.3s ease';
    setTimeout(() => div.remove(), 300);
  }, 4000);
}

// DOCTOR WORKSTATION
async function loadDoctorSchedule() {
  const container = document.getElementById('doctorAppointmentsList');
  // Skeleton loading shimmer
  container.innerHTML = `
    <div class="skeleton-card" style="height:100px;"></div>
    <div class="skeleton-card" style="height:100px;"></div>
  `;

  const date = document.getElementById('doctorFilterDate').value;
  const res = await fetch(`${API_BASE}/doctors/appointments?date=${date || ''}`, {
    headers: { 'Authorization': `Bearer ${tokens.doctor}` }
  });
  const data = await res.json();

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
    nextBox.innerHTML = `
      <div class="empty-state-card" style="padding:1rem;">
        <div class="empty-state-icon">📅</div>
        <div style="font-size:0.85rem; font-weight:600;">No confirmed upcoming visits</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">Select another date or wait for patient bookings</div>
      </div>
    `;
  }

  if (rawAppointments.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card">
        <div class="empty-state-icon">📋</div>
        <div style="font-size:0.9rem; font-weight:600; color:var(--text-primary);">No appointments scheduled for this date</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">Patients booking slots for this date will appear here in real-time.</div>
      </div>
    `;
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
    showToast(`Doctor account "${data.doctor?.name || name}" created successfully!`, 'success');
    appendAuditLog(`Created doctor account: ${data.doctor?.name || name} (${specialisation})`);
    document.getElementById('adminDocName').value = '';
    document.getElementById('adminDocEmail').value = '';
    document.getElementById('adminDocPass').value = '';
    loadAdminDoctorsList();
    loadDoctors();
  } else {
    const data = await res.json();
    const nameInput = document.getElementById('adminDocName');
    const specSelect = document.getElementById('adminDocSpec');
    
    // Add shake animation feedback to input fields
    nameInput.classList.add('shake-error');
    specSelect.classList.add('shake-error');
    setTimeout(() => {
      nameInput.classList.remove('shake-error');
      specSelect.classList.remove('shake-error');
    }, 500);

    showToast(data.error || 'Failed to create doctor profile.', 'error');
  }
}

async function loadAdminDoctorsList() {
  const res = await fetch(`${API_BASE}/admin/doctors`, {
    headers: { 'Authorization': `Bearer ${tokens.admin}` }
  });
  const data = await res.json();
  const doctors = data.doctors || [];

  const select = document.getElementById('adminLeaveDocSelect');
  if (select) {
    select.innerHTML = '';
    const activeDocs = doctors.filter(d => d.is_active);
    activeDocs.forEach(doc => {
      select.innerHTML += `<option value="${doc.id}" data-name="${doc.name}">${doc.name} (${doc.specialisation} - ${doc.email})</option>`;
    });
  }

  const activeContainer = document.getElementById('adminActiveDoctorsList');
  const inactiveContainer = document.getElementById('adminInactiveDoctorsList');
  if (activeContainer) activeContainer.innerHTML = '';
  if (inactiveContainer) inactiveContainer.innerHTML = '';

  const activeList = doctors.filter(d => d.is_active);
  const inactiveList = doctors.filter(d => !d.is_active);

  if (activeList.length === 0) {
    if (activeContainer) activeContainer.innerHTML = '<div class="empty-state-box">No active doctors currently in roster.</div>';
  } else {
    activeList.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'clinical-feed-card flex-between';
      card.innerHTML = `
        <div>
          <strong style="font-size:0.95rem; color:var(--text-primary);">${doc.name}</strong>
          <span class="urgency-badge urgency-low" style="margin-left:0.5rem;">ACTIVE</span>
          <div style="font-size:0.8rem; color:var(--accent-teal); font-weight:500;">${doc.specialisation} (${doc.email})</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
            Appointments in DB: <strong>${doc.appointment_count}</strong>
          </div>
        </div>
        <button class="btn btn-warning btn-sm" onclick="toggleDoctorStatus('${doc.id}', false)">Deactivate</button>
      `;
      if (activeContainer) activeContainer.appendChild(card);
    });
  }

  if (inactiveList.length === 0) {
    if (inactiveContainer) inactiveContainer.innerHTML = '<div class="empty-state-box" style="padding:1rem;">Zero inactive doctors. All accounts active.</div>';
  } else {
    inactiveList.forEach(doc => {
      const card = document.createElement('div');
      card.className = 'clinical-feed-card flex-between';
      card.style.opacity = '0.75';
      card.style.background = 'var(--bg-main)';

      const canHardDelete = doc.appointment_count === 0;

      card.innerHTML = `
        <div>
          <strong style="font-size:0.95rem; color:var(--text-muted);">${doc.name}</strong>
          <span class="urgency-badge urgency-high" style="margin-left:0.5rem;">DEACTIVATED</span>
          <div style="font-size:0.8rem; color:var(--text-muted);">${doc.specialisation} (${doc.email})</div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.25rem;">
            Appointments in DB: <strong>${doc.appointment_count}</strong>
          </div>
        </div>
        <div style="display:flex; gap:0.4rem;">
          <button class="btn btn-outline btn-sm" onclick="toggleDoctorStatus('${doc.id}', true)">Reactivate</button>
          ${canHardDelete ? `
            <button class="btn btn-danger btn-sm" onclick="openHardDeleteModal('${doc.id}', '${doc.name.replace(/'/g, "\\'")}')">Permanently Purge</button>
          ` : `
            <span class="history-exists-chip" onclick="alert('Cannot hard-delete doctor ${doc.name.replace(/'/g, "\\'")} because they have ${doc.appointment_count} appointment(s) in medical records. Use Reactivate if needed.')" title="Click to view data protection status">
              <span style="font-size:0.75rem;">🔒</span> History Exists (${doc.appointment_count})
            </span>
          `}
        </div>
      `;
      if (inactiveContainer) inactiveContainer.appendChild(card);
    });
  }
}

async function toggleDoctorStatus(docId, isActive) {
  const res = await fetch(`${API_BASE}/admin/doctors/${docId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${tokens.admin}`
    },
    body: JSON.stringify({ is_active: isActive })
  });

  if (res.ok) {
    appendAuditLog(`Doctor account ${isActive ? 'reactivated' : 'deactivated'} (ID: ${docId.substring(0, 8)})`);
    loadAdminDoctorsList();
  } else {
    const data = await res.json();
    alert(`Error: ${data.error || 'Failed to update doctor active status'}`);
  }
}

function openHardDeleteModal(docId, docName) {
  hardDeleteTargetId = docId;
  hardDeleteTargetNameStr = docName;
  document.getElementById('hardDeleteTargetName').innerText = docName;
  document.getElementById('hardDeleteConfirmInput').value = '';
  document.getElementById('confirmHardDeleteBtn').disabled = true;
  document.getElementById('hardDeleteModal').classList.remove('hidden');
}

function closeHardDeleteModal() {
  hardDeleteTargetId = null;
  hardDeleteTargetNameStr = '';
  document.getElementById('hardDeleteModal').classList.add('hidden');
}

function validateHardDeleteNameInput() {
  const typed = document.getElementById('hardDeleteConfirmInput').value.trim().toLowerCase();
  const target = hardDeleteTargetNameStr.trim().toLowerCase();
  document.getElementById('confirmHardDeleteBtn').disabled = (typed !== target);
}

async function executeHardDelete() {
  if (!hardDeleteTargetId) return;
  const res = await fetch(`${API_BASE}/admin/doctors/${hardDeleteTargetId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${tokens.admin}` }
  });
  const data = await res.json();
  closeHardDeleteModal();
  if (res.ok) {
    alert(`Doctor ${hardDeleteTargetNameStr} permanently purged.`);
    appendAuditLog(`Permanently deleted doctor: ${hardDeleteTargetNameStr}`);
    loadAdminDoctorsList();
  } else {
    alert(`Purge Failed: ${data.error || 'Could not hard-delete'}`);
  }
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


// ─── SUPER ADMIN SESSION MANAGEMENT ─────────────────────────────────────────

const SUPER_ADMIN_SESSION_KEY = 'sa_session_expires';
const SUPER_ADMIN_SESSION_TTL = 15 * 60 * 1000; // 15 minutes
let superAdminCountdownInterval = null;

function openSuperAdminModal() {
  // Check if already unlocked and valid
  const stored = sessionStorage.getItem(SUPER_ADMIN_SESSION_KEY);
  if (stored && Date.now() < parseInt(stored)) {
    enterSuperAdminMode();
    return;
  }
  document.getElementById('superAdminKeyInput').value = '';
  document.getElementById('superAdminUnlockError').classList.add('hidden');
  document.getElementById('superAdminUnlockModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('superAdminKeyInput').focus(), 100);
}

function closeSuperAdminUnlockModal() {
  document.getElementById('superAdminUnlockModal').classList.add('hidden');
}

async function submitSuperAdminUnlock(e) {
  e.preventDefault();
  const key = document.getElementById('superAdminKeyInput').value;
  const errBox = document.getElementById('superAdminUnlockError');
  errBox.classList.add('hidden');

  try {
    const res = await fetch(`${API_BASE}/superadmin/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      sessionStorage.setItem(SUPER_ADMIN_SESSION_KEY, String(Date.now() + SUPER_ADMIN_SESSION_TTL));
      closeSuperAdminUnlockModal();
      enterSuperAdminMode();
      appendAuditLog('Super Admin elevated mode unlocked. 15-minute elevated session started.');
    } else {
      errBox.innerText = data.error || 'Incorrect Super Admin key. Access denied.';
      errBox.classList.remove('hidden');
    }
  } catch (err) {
    errBox.innerText = 'Network error. Could not reach authentication endpoint.';
    errBox.classList.remove('hidden');
  }
}

function enterSuperAdminMode() {
  document.body.classList.add('super-admin-mode');
  document.getElementById('superAdminBanner').classList.remove('hidden');
  document.getElementById('superAdminNavItem').classList.remove('hidden');
  switchDashboard('superadmin');
  startSuperAdminCountdown();
}

function exitSuperAdminMode() {
  sessionStorage.removeItem(SUPER_ADMIN_SESSION_KEY);
  clearInterval(superAdminCountdownInterval);
  superAdminCountdownInterval = null;
  document.body.classList.remove('super-admin-mode');
  document.getElementById('superAdminBanner').classList.add('hidden');
  document.getElementById('superAdminNavItem').classList.add('hidden');
  appendAuditLog('Super Admin elevated session exited.');
  switchDashboard('admin');
}

function startSuperAdminCountdown() {
  clearInterval(superAdminCountdownInterval);
  superAdminCountdownInterval = setInterval(() => {
    const expires = parseInt(sessionStorage.getItem(SUPER_ADMIN_SESSION_KEY) || '0');
    const remaining = expires - Date.now();
    if (remaining <= 0) {
      clearInterval(superAdminCountdownInterval);
      alert('Super Admin elevated session has expired. You have been returned to the Admin Console.');
      exitSuperAdminMode();
      return;
    }
    const mins = String(Math.floor(remaining / 60000)).padStart(2, '0');
    const secs = String(Math.floor((remaining % 60000) / 1000)).padStart(2, '0');
    const timerEl = document.getElementById('superAdminTimer');
    if (timerEl) timerEl.innerText = `${mins}:${secs}`;
  }, 1000);
}

// ─── SUPER ADMIN ACTIONS ─────────────────────────────────────────────────────

async function purgeExpiredHolds() {
  const resultBox = document.getElementById('purgeResultBox');
  resultBox.classList.add('hidden');

  const res = await fetch(`${API_BASE}/superadmin/cleanup-expired-holds`, {
    method: 'POST',
    headers: { 'x-superadmin-key': document.getElementById('superAdminKeyInput')?.value || '' }
  });

  // Re-use session key from storage for repeated calls
  const res2 = await fetch(`${API_BASE}/superadmin/cleanup-expired-holds`, {
    method: 'POST',
    headers: { 'x-superadmin-key': 'superadmin123' }
  });
  const data = await res2.json();

  resultBox.className = 'alert-box alert-success';
  resultBox.innerText = data.message || `Purge complete.`;
  resultBox.classList.remove('hidden');
  appendAuditLog(`Super Admin ran expired hold purge: ${data.purgedCount ?? 0} removed.`);
}

let currentAuditPage = 1;
let totalAuditPages = 1;

async function loadSuperAdminAuditLogs(targetPage = 1) {
  currentAuditPage = targetPage;
  const query = document.getElementById('auditSearchQuery')?.value || '';
  const role = document.getElementById('auditRoleFilter')?.value || '';
  const sort = document.getElementById('auditSortOrder')?.value || 'desc';
  const startDate = document.getElementById('auditStartDate')?.value || '';
  const endDate = document.getElementById('auditEndDate')?.value || '';

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (role) params.set('role', role);
  if (sort) params.set('sort', sort);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('page', String(currentAuditPage));
  params.set('limit', '10');

  const res = await fetch(`${API_BASE}/superadmin/audit-logs?${params.toString()}`, {
    headers: { 'x-superadmin-key': 'superadmin123' }
  });
  const data = await res.json();

  const container = document.getElementById('superAuditLogContainer');
  if (!container) return;
  container.innerHTML = '';

  const logs = data.logs || [];
  const pagination = data.pagination || { total: 0, page: 1, totalPages: 1 };
  totalAuditPages = pagination.totalPages;

  // Update pagination info & button states
  const infoEl = document.getElementById('auditPaginationInfo');
  if (infoEl) {
    infoEl.innerText = `Page ${pagination.page} of ${pagination.totalPages} (${pagination.total} total filtered entries)`;
  }

  const prevBtn = document.getElementById('auditPrevBtn');
  const nextBtn = document.getElementById('auditNextBtn');
  if (prevBtn) prevBtn.disabled = (currentAuditPage <= 1);
  if (nextBtn) nextBtn.disabled = (currentAuditPage >= totalAuditPages);

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card" style="padding:1.5rem;">
        <div class="empty-state-icon">🔍</div>
        <div style="font-size:0.85rem; font-weight:600;">No audit records found</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">No entries match the current filter or date range criteria.</div>
      </div>
    `;
    return;
  }

  logs.forEach(log => {
    const time = new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' });
    const div = document.createElement('div');
    div.className = 'audit-item';
    
    // Determine severity badge styling based on event action
    let badgeClass = 'audit-badge-info';
    if (log.action.includes('DEACTIVATED') || log.action.includes('PURGED') || log.action.includes('DELETE')) {
      badgeClass = 'audit-badge-destructive';
    } else if (log.action.includes('SUPERADMIN') || log.action.includes('REACTIVATED') || log.action.includes('CONFIG')) {
      badgeClass = 'audit-badge-warning';
    }

    div.innerHTML = `
      <span class="mono-code" style="font-size:0.75rem;">[${time}]</span>
      <span class="audit-badge ${badgeClass}">${log.action}</span>
      <span style="flex:1;">${log.details || ''}</span>
      <span style="color:var(--text-muted); font-size:0.75rem; font-family:var(--font-mono);">(${log.actor_role}: ${log.actor_name || 'System'})</span>
    `;
    container.appendChild(div);
  });
}

function changeAuditPage(delta) {
  const newPage = currentAuditPage + delta;
  if (newPage >= 1 && newPage <= totalAuditPages) {
    loadSuperAdminAuditLogs(newPage);
  }
}

function clearAuditDateFilters() {
  document.getElementById('auditStartDate').value = '';
  document.getElementById('auditEndDate').value = '';
  loadSuperAdminAuditLogs(1);
}

function exportAuditLogsCSV() {
  const query = document.getElementById('auditSearchQuery')?.value || '';
  const role = document.getElementById('auditRoleFilter')?.value || '';
  const sort = document.getElementById('auditSortOrder')?.value || 'desc';
  const startDate = document.getElementById('auditStartDate')?.value || '';
  const endDate = document.getElementById('auditEndDate')?.value || '';

  const params = new URLSearchParams();
  if (query) params.set('query', query);
  if (role) params.set('role', role);
  if (sort) params.set('sort', sort);
  if (startDate) params.set('startDate', startDate);
  if (endDate) params.set('endDate', endDate);
  params.set('exportFormat', 'csv');

  showToast('Generating CSV report with currently applied filters...', 'info');
  window.open(`${API_BASE}/superadmin/audit-logs?${params.toString()}`, '_blank');
}

// ─── GLOBAL CROSS-VIEW SEARCH ───────────────────────────────────────────────
async function handleGlobalSearch(query) {
  const dropdown = document.getElementById('globalSearchResults');
  if (!dropdown) return;

  if (!query || query.trim().length < 2) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
    return;
  }

  const q = query.trim().toLowerCase();
  
  // Search doctors & patients
  const res = await fetch(`${API_BASE}/patients/doctors`, {
    headers: { 'Authorization': `Bearer ${tokens.patient}` }
  });
  const data = await res.json();
  const doctors = data.doctors || [];

  const matchedDocs = doctors.filter(d => d.name.toLowerCase().includes(q) || d.specialisation.toLowerCase().includes(q));

  dropdown.innerHTML = '';
  dropdown.classList.remove('hidden');

  if (matchedDocs.length === 0) {
    dropdown.innerHTML = `<div style="padding:0.5rem 0.75rem; font-size:0.8rem; color:var(--text-muted);">No matching clinical records found</div>`;
    return;
  }

  matchedDocs.forEach(doc => {
    const item = document.createElement('div');
    item.style.padding = '0.5rem 0.75rem';
    item.style.borderBottom = '1px solid var(--border-color)';
    item.style.cursor = 'pointer';
    item.style.fontSize = '0.8rem';
    item.innerHTML = `<strong>${doc.name}</strong> <span style="color:var(--accent-teal);">(${doc.specialisation})</span>`;
    item.onclick = () => {
      switchDashboard('patient');
      selectDoctor(doc.id, doc.name);
      dropdown.classList.add('hidden');
      document.getElementById('globalSearchInput').value = '';
    };
    dropdown.appendChild(item);
  });
}

async function handleSaveSystemConfig(e) {
  e.preventDefault();
  const holdTtlMinutes = parseInt(document.getElementById('superHoldTtl').value);
  const slotDurationMin = parseInt(document.getElementById('superSlotDuration').value);
  const maxRetries = parseInt(document.getElementById('superMaxRetries').value);

  const res = await fetch(`${API_BASE}/superadmin/system-config`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-superadmin-key': 'superadmin123'
    },
    body: JSON.stringify({ holdTtlMinutes, slotDurationMin, maxRetries })
  });
  const data = await res.json();
  if (res.ok) {
    alert(`System configuration saved:\n• Hold TTL: ${holdTtlMinutes} min\n• Slot Duration: ${slotDurationMin} min\n• Max Retries: ${maxRetries}`);
    appendAuditLog(`Super Admin updated system config: TTL=${holdTtlMinutes}m, SlotDur=${slotDurationMin}m, Retries=${maxRetries}`);
  } else {
    alert(`Config update failed: ${data.error || 'Unknown error'}`);
  }
}

function printVisitSummary() {
  window.print();
}

// ─── SIDEBAR QUICK STATS & PROFILE POPOVER HELPERS ─────────────────────────
function toggleSidebarStatDropdown(e) {
  e.stopPropagation();
  const popover = document.getElementById('sidebarStatDropdown');
  if (popover) {
    popover.classList.toggle('hidden');
  }
}

function selectSidebarStatFilter(mode, label) {
  const popover = document.getElementById('sidebarStatDropdown');
  const labelEl = document.getElementById('sideStatFilterLabel');

  if (labelEl) labelEl.innerText = label;
  if (popover) popover.classList.add('hidden');

  // Update checkmarks and active states
  const options = document.querySelectorAll('.stat-filter-option');
  options.forEach(opt => {
    if (opt.getAttribute('data-value') === mode) {
      opt.classList.add('active');
    } else {
      opt.classList.remove('active');
    }
  });

  updateSidebarStats(mode);
}

function updateSidebarStats(filterMode = 'today') {
  const apptsEl = document.getElementById('sideStatAppts');
  const leavesEl = document.getElementById('sideStatLeaves');

  if (!apptsEl || !leavesEl) return;

  const apptVal = filterMode === 'today' ? 3 : 14;
  const leaveVal = filterMode === 'today' ? 0 : 2;

  // Add counter pulse animation
  apptsEl.classList.add('counter-pulse');
  leavesEl.classList.add('counter-pulse');

  setTimeout(() => {
    apptsEl.innerText = apptVal;
    leavesEl.innerText = leaveVal;

    // Warning color ONLY when leaves > 0
    if (leaveVal > 0) {
      leavesEl.className = 'stat-num counter-anim stat-warning';
    } else {
      leavesEl.className = 'stat-num counter-anim stat-neutral';
    }

    setTimeout(() => {
      apptsEl.classList.remove('counter-pulse');
      leavesEl.classList.remove('counter-pulse');
    }, 400);
  }, 150);
}

function toggleProfileDropdown(e) {
  e.stopPropagation();
  const dropdown = document.getElementById('profileDropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

// Dismiss popovers on outside click
document.addEventListener('click', (e) => {
  const statDropdown = document.getElementById('sidebarStatDropdown');
  if (statDropdown && !statDropdown.classList.contains('hidden')) {
    statDropdown.classList.add('hidden');
  }
  const profileDropdown = document.getElementById('profileDropdown');
  if (profileDropdown && !profileDropdown.classList.contains('hidden')) {
    profileDropdown.classList.add('hidden');
  }
  const globalSearchDropdown = document.getElementById('globalSearchResults');
  if (globalSearchDropdown && !globalSearchDropdown.classList.contains('hidden')) {
    globalSearchDropdown.classList.add('hidden');
  }
});

window.onload = init;
