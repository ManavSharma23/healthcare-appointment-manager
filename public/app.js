const API_BASE = '';
let activeToken = '';
let activeRole = 'patient';
let activeHoldId = null;
let selectedDoctorId = null;

const tokens = {
  patient: '',
  doctor: '',
  admin: '',
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

function switchDashboard(role) {
  activeRole = role;
  activeToken = tokens[role] || '';

  document.querySelectorAll('.nav-pill').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.remove('active'));

  document.getElementById(`${role}Dashboard`).classList.add('active');
  
  // Highlight active pill
  const btnIndex = role === 'patient' ? 0 : role === 'doctor' ? 1 : 2;
  document.querySelectorAll('.nav-pill')[btnIndex]?.classList.add('active');

  document.getElementById('currentRole').innerText = `${role.toUpperCase()}`;

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
  document.getElementById('statDoctorsCount').innerText = `${doctors.length} Active`;

  doctors.forEach(doc => {
    const div = document.createElement('div');
    div.className = 'doctor-card-item';
    div.innerHTML = `
      <div>
        <h4 style="font-weight:700;">${doc.name}</h4>
        <div style="font-size:0.85rem; color:var(--text-muted);">${doc.specialisation}</div>
        <div style="font-size:0.75rem; color:var(--text-dim); margin-top:0.2rem;">Hours: ${doc.working_hours.start} - ${doc.working_hours.end} | ${doc.slot_duration_min} min slots</div>
      </div>
      <button class="btn btn-primary" onclick="selectDoctor('${doc.id}', '${doc.name}')">Select Doctor</button>
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
    grid.innerHTML = `<div style="grid-column: 1/-1; color:var(--danger); font-size:0.9rem;">⚠️ ${data.message}</div>`;
    return;
  }

  (data.slots || []).forEach(slot => {
    const btn = document.createElement('button');
    const timeStr = new Date(slot.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    btn.className = `slot-btn ${slot.available ? 'available' : 'disabled'}`;
    btn.innerText = timeStr;
    if (slot.available) {
      btn.onclick = () => holdSlot(slot.slot_start);
    } else {
      btn.disabled = true;
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
      msgDiv.innerHTML = `<div style="color:var(--success); font-size:0.9rem; margin-top:0.75rem;">⚡ Slot Held! Fill in symptoms below to confirm.</div>`;
      document.getElementById('activeHoldSection').classList.remove('hidden');
      loadDoctorSlots();
    } else {
      msgDiv.innerHTML = `<div style="color:var(--danger); font-size:0.9rem; margin-top:0.75rem;">🚫 ${data.error || 'Slot no longer available'}</div>`;
      loadDoctorSlots();
    }
  } catch (err) {
    msgDiv.innerHTML = `<div style="color:var(--danger);">Network Error</div>`;
  }
}

async function submitSymptomsAndConfirm() {
  if (!activeHoldId) return;
  const symptoms = document.getElementById('symptomsInput').value;
  if (!symptoms || symptoms.length < 5) {
    alert('Please describe your symptoms (minimum 5 characters).');
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
    alert('✨ Appointment Confirmed! Pre-visit AI summary generated & Google Calendar synced.');
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

  if (!data.appointments || data.appointments.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No active appointments found.</p>';
    return;
  }

  data.appointments.forEach(appt => {
    const timeStr = new Date(appt.slot_start).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    const card = document.createElement('div');
    card.className = 'appointment-card';
    card.innerHTML = `
      <div class="flex-between">
        <div>
          <strong style="font-size:1rem;">Dr. ${appt.patient_name || 'Specialist Doctor'}</strong>
          <div style="font-size:0.8rem; color:var(--text-muted);">${timeStr}</div>
        </div>
        <span class="badge ${appt.status === 'confirmed' ? 'badge-low' : 'badge-medium'}">${appt.status.toUpperCase()}</span>
      </div>

      ${appt.symptom_summary ? `
        <div class="ai-summary-box">
          <div class="ai-summary-title">
            ✨ AI Pre-Visit Triage
            <span class="badge badge-${(appt.symptom_summary.ai_summary?.urgency || 'Medium').toLowerCase()}">Urgency: ${appt.symptom_summary.ai_summary?.urgency || 'Medium'}</span>
          </div>
          <div style="font-size:0.85rem; color:var(--text-main);"><strong>Chief Complaint:</strong> ${appt.symptom_summary.ai_summary?.chief_complaint || appt.symptom_summary.symptoms}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.3rem;"><strong>Suggested Questions:</strong> ${(appt.symptom_summary.ai_summary?.questions || []).join(' • ')}</div>
        </div>
      ` : ''}

      ${appt.visit_note?.ai_patient_summary ? `
        <div class="ai-summary-box" style="background:rgba(16,185,129,0.08); border-color:rgba(16,185,129,0.2);">
          <div class="ai-summary-title" style="color:var(--success);">
            🩺 Patient-Friendly Post-Visit Summary
          </div>
          <div style="font-size:0.85rem; color:var(--text-main);">${appt.visit_note.ai_patient_summary}</div>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

// DOCTOR PORTAL
async function loadDoctorSchedule() {
  const date = document.getElementById('doctorFilterDate').value;
  const res = await fetch(`${API_BASE}/doctors/appointments?date=${date || ''}`, {
    headers: { 'Authorization': `Bearer ${tokens.doctor}` }
  });
  const data = await res.json();

  const container = document.getElementById('doctorAppointmentsList');
  container.innerHTML = '';

  if (!data.appointments || data.appointments.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted); padding:1rem;">No appointments scheduled for this date.</p>';
    return;
  }

  data.appointments.forEach(appt => {
    const timeStr = new Date(appt.slot_start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'appointment-card';
    div.innerHTML = `
      <div class="flex-between">
        <div>
          <h4 style="font-size:1.05rem; font-weight:700;">${timeStr} - ${appt.patient_name}</h4>
          <div style="font-size:0.85rem; color:var(--text-muted);">${appt.patient_email}</div>
        </div>
        <span class="badge ${appt.status === 'confirmed' ? 'badge-low' : appt.status === 'completed' ? 'badge-low' : 'badge-medium'}">${appt.status.toUpperCase()}</span>
      </div>
      
      ${appt.symptom_summary ? `
        <div class="ai-summary-box">
          <div class="ai-summary-title">
            ✨ Pre-Visit AI Triage Summary
            <span class="badge badge-${(appt.symptom_summary.ai_summary?.urgency || 'Medium').toLowerCase()}">${appt.symptom_summary.ai_summary?.urgency || 'Medium'} Urgency</span>
          </div>
          <div style="font-size:0.85rem;"><strong>Symptoms:</strong> ${appt.symptom_summary.symptoms}</div>
          <div style="font-size:0.85rem; margin-top:0.2rem;"><strong>Chief Complaint:</strong> ${appt.symptom_summary.ai_summary?.chief_complaint || 'N/A'}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.3rem;"><strong>3 Suggested Questions for Doctor:</strong><br> ${ (appt.symptom_summary.ai_summary?.questions || []).map(q => `• ${q}`).join('<br>') }</div>
        </div>
      ` : '<div style="font-size:0.8rem; color:var(--text-muted); margin-top:0.5rem;">No pre-visit symptoms submitted.</div>'}

      ${appt.status !== 'completed' ? `
        <hr class="divider">
        <h5 style="font-size:0.9rem; font-weight:700; margin-bottom:0.5rem;">Submit Post-Visit Clinical Notes & Prescription</h5>
        <div class="form-group">
          <textarea id="notes_${appt.id}" rows="2" placeholder="Clinical diagnosis and notes..."></textarea>
        </div>
        <button class="btn btn-primary" onclick="submitPostVisitNotes('${appt.id}')">Submit Clinical Notes (Triggers Post-Visit AI Summary)</button>
      ` : `
        <div class="ai-summary-box" style="background:rgba(16,185,129,0.08); border-color:rgba(16,185,129,0.2);">
          <div class="ai-summary-title" style="color:var(--success);">🩺 Generated Post-Visit Patient Summary</div>
          <div style="font-size:0.85rem;">${appt.visit_note?.ai_patient_summary || 'N/A'}</div>
        </div>
      `}
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
    alert('✨ Clinical notes submitted! Post-visit AI summary created & medication reminders scheduled.');
    loadDoctorSchedule();
  }
}

// ADMIN PORTAL
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
    alert('✨ Doctor profile created successfully!');
    loadAdminDoctorsList();
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
  (data.doctors || []).forEach(doc => {
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
    alert(`🌴 Doctor leave scheduled for ${date}! ${data.result?.cancelledAppointmentsCount || 0} conflicting appointments cancelled & patients notified.`);
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
    container.innerHTML = '<div style="color:var(--text-muted); font-size:0.85rem; padding:1rem;">✅ All notifications delivered cleanly! Dead-letter queue is empty.</div>';
    return;
  }

  data.failedNotifications.forEach(notif => {
    const div = document.createElement('div');
    div.className = 'appointment-card flex-between';
    div.innerHTML = `
      <div>
        <strong style="color:var(--danger);">${notif.type.toUpperCase()}</strong> (${notif.channel})<br>
        <small style="color:var(--text-muted);">User: ${notif.user?.email || 'N/A'} | Retries: ${notif.retry_count}/3</small>
      </div>
      <button class="btn btn-glass" onclick="retryFailedNotification('${notif.id}')">🔄 Retry Delivery</button>
    `;
    container.appendChild(div);
  });
}

async function retryFailedNotification(id) {
  await fetch(`${API_BASE}/admin/notifications/${id}/retry`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${tokens.admin}` }
  });
  alert('Notification requeued for retry!');
  loadFailedNotifications();
}

window.onload = init;
