const API_BASE = localStorage.getItem('LM_API_BASE') || 'http://127.0.0.1:5000';

function getToken() {
  return localStorage.getItem('lm_token') || localStorage.getItem('access_token');
}

function getUser() {
  try { return JSON.parse(localStorage.getItem('lm_user') || 'null'); }
  catch { return null; }
}

function clearSession() {
  localStorage.removeItem('lm_token');
  localStorage.removeItem('access_token');
  localStorage.removeItem('lm_user');
  sessionStorage.removeItem('lm_user');
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json() : await response.text();

  if (!response.ok) {
    if (response.status === 401 && path !== '/login') {
      clearSession();
      document.getElementById('lm-login')?.remove();
      showLogin();
    }
    const message = typeof data === 'object' ? (data.error || data.message) : data;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return data;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
  }[c]));
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-IN', {
    day:'2-digit', month:'short', year:'numeric'
  });
}

function statusClass(status='') {
  const s = String(status).toUpperCase();
  if (['VERIFIED','ACTIVE','APPROVED'].includes(s)) return 'bg-green-100 text-green-800';
  if (['REJECTED','EXPIRED'].includes(s)) return 'bg-red-100 text-red-800';
  if (['ASSIGNED','SCHEDULED','APPLICATION_SUBMITTED','PENDING','SUBMITTED'].includes(s)) return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function addModal(id, title, body) {
  document.getElementById(id)?.remove();
  const el = document.createElement('div');
  el.id = id;
  el.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4';
  el.innerHTML = `<div class="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
    <div class="flex items-center justify-between mb-5">
      <h2 class="text-lg font-bold text-primary">${esc(title)}</h2>
      <button type="button" id="${id}-close" class="text-2xl text-gray-500" aria-label="Close">&times;</button>
    </div>${body}</div>`;
  document.body.appendChild(el);
  document.getElementById(`${id}-close`)?.addEventListener('click', () => el.remove());
  el.addEventListener('click', e => { if (e.target === el) el.remove(); });
  return el;
}

function showToast(message, good=true) {
  const t = document.createElement('div');
  t.className = `fixed bottom-6 right-6 z-[200] px-4 py-3 rounded-lg shadow-lg text-white ${good ? 'bg-green-700' : 'bg-red-700'}`;
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

function showInfo(title, text) {
  addModal('info-modal', title, `<p class="text-sm text-slate-700 leading-6">${esc(text)}</p>`);
}

function showLogin() {
  if (document.getElementById('lm-login')) return;
  const modal = addModal('lm-login', 'Legal Metrology Login', `
    <form id="lm-login-form" class="space-y-3">
      <input id="lm-email" required type="email" placeholder="Email" class="w-full border rounded-lg px-3 py-2">
      <input id="lm-password" required type="password" placeholder="Password" class="w-full border rounded-lg px-3 py-2">
      <button type="submit" class="w-full bg-[#16233F] text-white rounded-lg py-2.5 font-semibold">Login</button>
      <p id="lm-login-error" class="text-sm text-red-700"></p>
    </form>
    <p class="text-xs text-gray-500 mt-4">Use an account created by the backend seed script.</p>`);

  document.getElementById('lm-login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const err = document.getElementById('lm-login-error');
    try {
      const data = await api('/login', {
        method:'POST',
        body:JSON.stringify({
          email:document.getElementById('lm-email').value.trim(),
          password:document.getElementById('lm-password').value
        })
      });
      localStorage.setItem('lm_token', data.access_token);
      localStorage.setItem('lm_user', JSON.stringify(data.user));
      modal.remove();
      showToast('Logged in successfully');
      await bootPage();
    } catch (e) { err.textContent = e.message; }
  });
}

function logout() {
  clearSession();
  try {
    window.location.replace('index.html');
  } catch {
    window.location.href = 'index.html';
  }
}

function toggleSettingsMenu(force) {
  const menu = document.getElementById('settingsMenu');
  if (!menu) return false;
  const shouldOpen = force === undefined
    ? menu.classList.contains('hidden')
    : Boolean(force);
  menu.classList.toggle('hidden', !shouldOpen);
  return shouldOpen;
}

function toggleNotifPanel(open) {
  const overlay = document.getElementById('notifOverlay');
  const panel = document.getElementById('notifPanel');
  if (!overlay || !panel) return;
  overlay.classList.toggle('opacity-0', !open);
  overlay.classList.toggle('pointer-events-none', !open);
  panel.classList.toggle('translate-x-full', !open);
}

function wireUserMenu() {
  const avatar = document.getElementById('avatarBtn');
  const menu = document.getElementById('settingsMenu');
  if (!menu) return;

  if (avatar) {
    avatar.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSettingsMenu();
    };
  }

  menu.querySelectorAll('[data-menu-action]').forEach(button => {
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const action = button.dataset.menuAction;
      const u = getUser() || {};

      if (action === 'profile') {
        addModal('profile-modal', 'Profile', `
          <div class="space-y-3 text-sm">
            <p><b>Name:</b> ${esc(u.name || '—')}</p>
            <p><b>Email:</b> ${esc(u.email || '—')}</p>
            <p><b>Role:</b> ${esc(String(u.role || '—').replaceAll('_', ' '))}</p>
          </div>`);
      } else if (action === 'settings') {
        addModal('settings-modal', 'Account Settings', `
          <div class="space-y-3 text-sm">
            <p><b>Account:</b> ${esc(u.email || '—')}</p>
            <p><b>Role:</b> ${esc(String(u.role || '—').replaceAll('_', ' '))}</p>
            <p class="text-slate-600">Authentication is handled by the Flask backend.</p>
          </div>`);
      } else if (action === 'appearance') {
        const enabled = document.documentElement.classList.toggle('dark');
        localStorage.setItem('lm_dark_mode', enabled ? '1' : '0');
      } else if (action === 'help') {
        showInfo('Help & Support', 'Use Dashboard, Applications, Verification and Reports to follow the workflow. Owners register instruments and submit applications; Admin assigns and schedules; LMO/GATC perform verification.');
      } else if (action === 'logout') {
        logout();
        return;
      }

      toggleSettingsMenu(false);
    };
  });
}

function wireNavigation() {
  const links = [...document.querySelectorAll('nav a[href]')];
  links.forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href === '#') return;
    link.addEventListener('click', e => {
      if (href.endsWith('.html')) return;
      e.preventDefault();
    });
  });
}

function clearStaticContent() {
  const file = location.pathname.split('/').pop().toLowerCase();
  const tbody = document.querySelector('main table tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-500">Loading live data…</td></tr>';

  document.querySelectorAll('main').forEach(main => {
    main.querySelectorAll('h2').forEach(h => {
      if (/TradeCorp|Industrial Metrics|Bharat Precision/i.test(h.textContent)) h.textContent = 'Loading account…';
    });
  });

  if (file.includes('dashboard')) {
    const cards = [...document.querySelectorAll('main .grid > div')];
    const active = cards.find(x => /Active Certificates/i.test(x.innerText));
    const progress = cards.find(x => /Apps in Progress/i.test(x.innerText));
    [active, progress].forEach(card => card?.querySelector('.font-display-lg')?.replaceChildren(document.createTextNode('—')));
    const next = cards.find(x => /Next Verification/i.test(x.innerText));
    next?.querySelector('.font-headline-md')?.replaceChildren(document.createTextNode('Not scheduled'));
    next?.querySelector('p')?.replaceChildren(document.createTextNode('No pending verification date'));
  }
}

function openInstrumentModal() {
  const user = getUser();
  if (user?.role !== 'OWNER') return showToast('Only instrument owners can register instruments.', false);
  const modal = addModal('instrument-modal', 'Register Instrument', `<form id="instrument-form" class="grid grid-cols-2 gap-3">
    <input name="instrument_number" required placeholder="Instrument ID" class="border rounded-lg px-3 py-2">
    <input name="instrument_type" required placeholder="Instrument type" class="border rounded-lg px-3 py-2">
    <input name="manufacturer" required placeholder="Manufacturer" class="border rounded-lg px-3 py-2">
    <input name="model_number" required placeholder="Model number" class="border rounded-lg px-3 py-2">
    <input name="serial_number" required placeholder="Serial number" class="border rounded-lg px-3 py-2">
    <input name="capacity" required placeholder="Capacity" class="border rounded-lg px-3 py-2">
    <input name="location" required placeholder="Location" class="border rounded-lg px-3 py-2 col-span-2">
    <button type="submit" class="col-span-2 bg-[#16233F] text-white rounded-lg py-2.5">Register</button>
  </form>`);
  document.getElementById('instrument-form').addEventListener('submit', async e => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      await api('/instruments', {method:'POST', body:JSON.stringify(data)});
      modal.remove(); showToast('Instrument registered'); await dashboardPage();
    } catch (err) { showToast(err.message, false); }
  });
}

async function openApplicationModal() {
  const user = getUser();
  if (user?.role !== 'OWNER') return showToast('Only instrument owners can submit applications.', false);
  try {
    const inst = await api('/instruments/my');
    if (!inst.instruments?.length) return showToast('Register an instrument first.', false);
    const options = inst.instruments.map(i => `<option value="${i.id}">${esc(i.instrument_number)} — ${esc(i.instrument_type)}</option>`).join('');
    const modal = addModal('application-modal', 'Submit Verification Application', `<form id="application-form" class="space-y-3">
      <label class="block text-sm font-semibold">Instrument<select name="instrument_id" required class="w-full border rounded-lg px-3 py-2 mt-1">${options}</select></label>
      <label class="block text-sm font-semibold">Application Type<select name="application_type" required class="w-full border rounded-lg px-3 py-2 mt-1"><option value="VERIFICATION">Verification</option><option value="RE_VERIFICATION">Re-verification</option></select></label>
      <button type="submit" class="w-full bg-[#16233F] text-white rounded-lg py-2.5">Submit Application</button>
    </form>`);
    document.getElementById('application-form').addEventListener('submit', async e => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(e.target).entries());
      data.instrument_id = Number(data.instrument_id);
      try {
        const r = await api('/applications', {method:'POST', body:JSON.stringify(data)});
        modal.remove(); showToast(`Application ${r.application.application_number} submitted`);
        const file = location.pathname.split('/').pop().toLowerCase();
        if (file.includes('application')) await applicationPage(); else await dashboardPage();
      } catch (err) { showToast(err.message, false); }
    });
  } catch (e) { showToast(e.message, false); }
}

async function dashboardPage() {
  const user = getUser(); if (!user) return;
  try {
    const [stats, appsData] = await Promise.all([api('/dashboard'), api('/applications')]);
    const apps = appsData.applications || [];
    const cards = [...document.querySelectorAll('main .grid > div')];
    const textCard = label => cards.find(x => x.innerText.toLowerCase().includes(label.toLowerCase()));
    textCard('Active Certificates')?.querySelector('.font-display-lg')?.replaceChildren(document.createTextNode(stats.certificates.active));
    textCard('Apps in Progress')?.querySelector('.font-display-lg')?.replaceChildren(document.createTextNode(apps.filter(a => ['SUBMITTED','ASSIGNED','SCHEDULED'].includes(String(a.status || '').toUpperCase())).length));
    const welcome = document.querySelector('main h2');
    if (welcome) welcome.textContent = `Welcome, ${user.name || user.role}`;
    const license = document.querySelector('main h2 + p');
    if (license) license.textContent = `Role: ${String(user.role || '').replaceAll('_',' ')}`;

    const tbody = document.querySelector('main table tbody');
    const headers = document.querySelectorAll('main table thead th');
    if (user.role === 'OWNER') {
      const instruments = (await api('/instruments/my')).instruments || [];
      if (headers.length >= 4) ['ID / Name','Category','Status','Action'].forEach((v,i)=>headers[i].textContent=v);
      if (tbody) tbody.innerHTML = instruments.map(i => `<tr class="border-b border-outline-variant">
        <td class="py-3 px-4"><div class="font-bold">${esc(i.instrument_number)}</div><div class="text-sm">${esc(i.manufacturer)} ${esc(i.model_number)}</div></td>
        <td class="py-3 px-4">${esc(i.instrument_type)}</td>
        <td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass(i.status)}">● ${esc(i.status)}</span></td>
        <td class="py-3 px-4 text-right"><button type="button" class="text-primary history-btn" data-id="${i.id}">History</button></td>
      </tr>`).join('') || '<tr><td colspan="4" class="p-6 text-center text-gray-500">No instruments registered yet.</td></tr>';
      tbody?.querySelectorAll('.history-btn').forEach(b=>b.addEventListener('click',()=>loadHistory(Number(b.dataset.id))));
      updateNextVerification(instruments, apps);
    } else {
      if (headers.length >= 4) ['Application','Instrument','Status','Action'].forEach((v,i)=>headers[i].textContent=v);
      if (tbody) tbody.innerHTML = apps.slice(0,6).map(a => `<tr class="border-b border-outline-variant">
        <td class="py-3 px-4 font-bold">${esc(a.application_number)}</td><td class="py-3 px-4">#${esc(a.instrument_id)}</td>
        <td class="py-3 px-4"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass(a.status)}">● ${esc(a.status)}</span></td>
        <td class="py-3 px-4 text-right"><button type="button" class="text-primary view-btn" data-id="${a.id}">View</button></td></tr>`).join('') || '<tr><td colspan="4" class="p-6 text-center text-gray-500">No applications available.</td></tr>';
      tbody?.querySelectorAll('.view-btn').forEach(b=>b.addEventListener('click',()=>viewApplication(Number(b.dataset.id))));
      updateNextVerification([], apps);
    }
    updateDashboardNotices(apps);
    await renderLiveNotifications(apps);
    wireDashboardButtons();
  } catch (e) { showToast(e.message, false); }
}

function updateNextVerification(instruments=[], apps=[]) {
  const card=[...document.querySelectorAll('main .grid > div')].find(x=>/Next Verification/i.test(x.innerText));
  if(!card)return;
  const dateEl=card.querySelector('.font-headline-md'); const descEl=card.querySelector('p');
  const scheduled=apps.filter(a=>a.scheduled_date && ['SCHEDULED','ASSIGNED'].includes(String(a.status).toUpperCase())).sort((a,b)=>new Date(a.scheduled_date)-new Date(b.scheduled_date))[0];
  const due=instruments.filter(i=>i.verification_due_date).sort((a,b)=>new Date(a.verification_due_date)-new Date(b.verification_due_date))[0];
  const item=scheduled||due;
  if(!item){dateEl&&(dateEl.textContent='Not scheduled');descEl&&(descEl.textContent='No pending verification date');return;}
  const date=scheduled?.scheduled_date||due?.verification_due_date;
  if(dateEl)dateEl.textContent=fmtDate(date);
  if(descEl)descEl.textContent=scheduled?`${scheduled.application_number} • Instrument #${scheduled.instrument_id}`:`${due.instrument_number} • ${due.instrument_type}`;
}

function updateDashboardNotices(apps=[]) {
  const box=document.getElementById('dashboard-notices'); if(!box)return;
  const notices=[];
  apps.slice().sort((a,b)=>new Date(b.submitted_at||0)-new Date(a.submitted_at||0)).slice(0,3).forEach(a=>{
    const s=String(a.status||'').toUpperCase();
    const map={SUBMITTED:['Application submitted',`${a.application_number} is awaiting officer assignment.`],ASSIGNED:['Officer assigned',`${a.application_number} has been assigned for verification.`],SCHEDULED:['Verification scheduled',`${a.application_number} is scheduled for ${fmtDate(a.scheduled_date)}.`],VERIFIED:['Verification completed',`${a.application_number} has been successfully verified.`],REJECTED:['Application rejected',`${a.application_number} was rejected during verification.`]};
    if(map[s])notices.push(map[s]);
  });
  if(!notices.length)notices.push(['System ready','No pending notices for this account.']);
  box.innerHTML=notices.map(([t,x])=>`<div class="border-l-4 border-primary pl-3"><h4 class="font-label-bold text-label-bold text-on-background">${esc(t)}</h4><p class="font-body-sm text-body-sm text-on-surface-variant mt-1">${esc(x)}</p></div>`).join('');
}

async function renderLiveNotifications(apps=[]) {
  const list=document.getElementById('notifList'); if(!list)return;
  const items=[];
  apps.slice().sort((a,b)=>new Date(b.submitted_at||0)-new Date(a.submitted_at||0)).slice(0,6).forEach(a=>{
    const s=String(a.status||'').toUpperCase();
    const map={SUBMITTED:['pending_actions','Application submitted',`${a.application_number} is awaiting assignment.`],ASSIGNED:['assignment','Officer assigned',`${a.application_number} has been assigned.`],SCHEDULED:['event','Verification scheduled',`${a.application_number} is scheduled for ${fmtDate(a.scheduled_date)}.`],VERIFIED:['workspace_premium','Verification completed',`${a.application_number} was verified.`],REJECTED:['warning','Application rejected',`${a.application_number} was rejected.`]};
    if(map[s])items.push(map[s]);
  });
  if(!items.length)items.push(['info','No new updates','Your account has no workflow notifications.']);
  list.innerHTML=items.map(n=>`<div class="flex gap-3 p-3 rounded-xl hover:bg-surface-container-high"><div class="w-10 h-10 rounded-lg bg-surface-container-high flex items-center justify-center"><span class="material-symbols-outlined">${esc(n[0])}</span></div><div><div class="font-label-bold text-label-bold text-on-background">${esc(n[1])}</div><p class="text-[13px] text-on-surface-variant mt-1">${esc(n[2])}</p></div></div>`).join('');
}

function wireDashboardButtons() {
  const user = getUser();
  const newApp = document.getElementById('newApplicationBtn');
  if (newApp) {
    const ownerOnly = user?.role === 'OWNER';
    newApp.classList.toggle('hidden', !ownerOnly);
    newApp.disabled = !ownerOnly;
    newApp.onclick = ownerOnly ? openApplicationModal : null;
  }

  [...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Register Equipment')).forEach(b=>{
    b.onclick = user?.role === 'OWNER' ? openInstrumentModal : () => showToast('Only instrument owners can register instruments.', false);
  });
  [...document.querySelectorAll('button')].filter(b=>b.innerText.includes('Schedule Verification')).forEach(b=>b.onclick=()=>location.href='2-Application.html');
  [...document.querySelectorAll('button')].filter(b=>b.innerText.trim()==='View All').forEach(b=>b.onclick=()=>location.href='2-Application.html');
}

async function applicationPage() {
  const user = getUser();
  if (!user) return;

  try {
    const data = await api('/applications');
    let officers = [];
    if (user.role === 'ADMIN') {
      officers = (await api('/verification-officers')).officers || [];
    }
    window.LM_OFFICERS = officers;

    const tbody = document.querySelector('main table tbody');
    if (!tbody) return;

    const apps = data.applications || [];

    const render = (rows) => {
      tbody.innerHTML = rows.map(a => {
        let action = `<button type="button" class="text-primary view-btn" data-id="${a.id}">View Details</button>`;
        if (user.role === 'ADMIN') {
          const assigned = !!a.assigned_to;
          const scheduleAllowed = ['SUBMITTED', 'ASSIGNED', 'SCHEDULED'].includes(String(a.status || '').toUpperCase());
          action = `
            ${assigned
              ? `<span class="text-xs text-slate-500 mr-3">Assigned</span>`
              : `<button type="button" class="text-primary mr-3 assign-btn" data-id="${a.id}">Assign</button>`}
            ${scheduleAllowed
              ? `<button type="button" class="text-primary schedule-btn" data-id="${a.id}">Schedule</button>`
              : ''}
          `;
        }

        return `<tr class="hover:bg-surface-container-low transition-colors">
          <td class="py-4 px-6 text-primary font-medium">${esc(a.application_number)}</td>
          <td class="py-4 px-6">${fmtDate(a.submitted_at)}</td>
          <td class="py-4 px-6">${esc(a.instrument_type || `Instrument #${a.instrument_id}`)}</td>
          <td class="py-4 px-6">${esc(formatApplicationType(a.application_type))}</td>
          <td class="py-4 px-6"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass(a.status)}">${esc(a.status)}</span></td>
          <td class="py-4 px-6 text-right">${action}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6" class="p-8 text-center text-gray-500">No applications found.</td></tr>';

      tbody.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => viewApplication(Number(b.dataset.id))));
      tbody.querySelectorAll('.assign-btn').forEach(b => b.addEventListener('click', () => assignApplication(Number(b.dataset.id))));
      tbody.querySelectorAll('.schedule-btn').forEach(b => b.addEventListener('click', () => scheduleApplication(Number(b.dataset.id))));
    };

    render(apps);
    wireApplicationControls(apps, render, user);
  } catch (e) {
    showToast(e.message, false);
  }
}

function wireApplicationControls(apps, render, user) {
  const search = [...document.querySelectorAll('main input')].find(i => /Search by Application/i.test(i.placeholder || ''));
  const statusButtons = [...document.querySelectorAll('main button')].filter(b => ['All', 'Under Review', 'Approved', 'Rejected'].includes(b.innerText.trim()));
  const typeSelect = [...document.querySelectorAll('main select')].find(s => s.innerText.includes('All Types'));
  let status = 'ALL', type = 'ALL', query = '';

  const applyFilters = () => {
    const filtered = apps.filter(a => {
      const s = String(a.status || '').toUpperCase();
      const statusOk = status === 'ALL'
        || (status === 'UNDER REVIEW' && ['SUBMITTED', 'ASSIGNED', 'SCHEDULED'].includes(s))
        || (status === 'APPROVED' && ['VERIFIED', 'APPROVED'].includes(s))
        || (status === 'REJECTED' && s === 'REJECTED');
      const typeOk = type === 'ALL' || String(a.application_type || '').toUpperCase() === type;
      const hay = `${a.application_number} ${a.instrument_id} ${a.instrument_type || ''} ${a.status} ${a.application_type}`.toLowerCase();
      return statusOk && typeOk && hay.includes(query.toLowerCase());
    });
    render(filtered);
  };

  search?.addEventListener('input', e => { query = e.target.value; applyFilters(); });
  const setActiveStatusButton = (active) => {
    statusButtons.forEach(b => {
      const isActive = b === active;
      b.classList.toggle('bg-[#003366]', isActive);
      b.classList.toggle('text-white', isActive);
      b.classList.toggle('bg-white', !isActive);
      b.classList.toggle('text-primary', !isActive);
      b.classList.toggle('border', true);
      b.classList.toggle('border-[#003366]', isActive);
      b.classList.toggle('border-outline-variant', !isActive);
    });
  };

  setActiveStatusButton(statusButtons.find(b => b.innerText.trim() === 'All'));

  statusButtons.forEach(b => b.addEventListener('click', () => {
    status = b.innerText.trim().toUpperCase();
    setActiveStatusButton(b);
    applyFilters();
  }));
  typeSelect?.addEventListener('change', e => {
    type = e.target.value === 'All Types' ? 'ALL' : e.target.value.toUpperCase().replaceAll(' ', '_');
    applyFilters();
  });
}

function formatApplicationType(type) {
  const t = String(type || '').toUpperCase();
  if (t === 'VERIFICATION' || t === 'INITIAL') return 'Initial Verification';
  if (t === 'RE_VERIFICATION' || t === 'REVERIFICATION') return 'Re-verification';
  return type || '—';
}

async function viewApplication(id){
  try{const d=await api(`/applications/${id}`);addModal('application-detail','Application Details',`<div class="space-y-2 text-sm"><p><b>Application:</b> ${esc(d.application.application_number)}</p><p><b>Type:</b> ${esc(formatApplicationType(d.application.application_type))}</p><p><b>Status:</b> ${esc(d.application.status)}</p><p><b>Date Submitted:</b> ${fmtDate(d.application.submitted_at)}</p><p><b>Scheduled Date:</b> ${fmtDate(d.application.scheduled_date)}</p><p><b>Instrument:</b> ${esc(d.instrument.instrument_number)} — ${esc(d.instrument.instrument_type)}</p><p><b>Location:</b> ${esc(d.instrument.location)}</p><p><b>Certificate:</b> ${esc(d.certificate?.certificate_number || 'Not generated')}</p>
        ${d.certificate?.certificate_number ? `
          <div class="mt-4 border-t pt-4">
            <p class="font-semibold mb-2">Certificate QR Code</p>
            <img src="${esc(d.certificate.qr_url || '')}" alt="QR code for ${esc(d.certificate.certificate_number)}" class="w-48 h-48 border rounded-lg p-2 bg-white" onerror="this.replaceWith(document.createTextNode('QR image unavailable'))">
            <p class="text-xs text-slate-500 mt-2 break-all">Scan to verify: ${esc(d.certificate.verify_url || '')}</p>
          </div>` : ''}
      </div>`);}catch(e){showToast(e.message,false);}
}

async function verificationPage() {
  const user = getUser();
  if (!user) return;

  try {
    const data = await api('/applications');
    const tbody = document.querySelector('main table tbody');
    if (!tbody) return;

    const apps = data.applications || [];
    const eligible = ['LMO', 'GATC'].includes(user.role)
      ? apps
      : apps.filter(a => ['SCHEDULED', 'ASSIGNED', 'VERIFIED', 'REJECTED'].includes(String(a.status || '').toUpperCase()));

    tbody.innerHTML = eligible.map(a => {
      const s = String(a.status || '').toUpperCase();
      const canVerify = ['LMO', 'GATC'].includes(user.role) && ['ASSIGNED', 'SCHEDULED'].includes(s);
      return `<tr class="hover:bg-surface-container-low transition-colors">
        <td class="py-4 px-6 text-primary font-medium">${esc(a.application_number)}</td>
        <td class="py-4 px-6">${esc(a.instrument_number || `Instrument #${a.instrument_id}`)}</td>
        <td class="py-4 px-6">${esc(a.instrument_type || '—')}</td>
        <td class="py-4 px-6">${fmtDate(a.scheduled_date)}</td>
        <td class="py-4 px-6">${fmtDate(a.last_verified_at)}</td>
        <td class="py-4 px-6"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass(a.status)}">${esc(a.status)}</span></td>
        <td class="py-4 px-6 text-right">
          ${canVerify
            ? `<button type="button" class="text-primary font-semibold verify-btn" data-id="${a.id}">Verify</button>`
            : `<button type="button" class="text-primary view-btn" data-id="${a.id}">View Details</button>`}
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="p-8 text-center text-gray-500">No applications assigned to this verification account.</td></tr>';

    tbody.querySelectorAll('.verify-btn').forEach(b => b.addEventListener('click', () => openVerification(Number(b.dataset.id))));
    tbody.querySelectorAll('.view-btn').forEach(b => b.addEventListener('click', () => viewApplication(Number(b.dataset.id))));
  } catch (e) {
    showToast(e.message, false);
  }
}

function openVerification(id){
  const modal=addModal('verify-modal','Field Verification',`<form id="verify-form" class="space-y-3"><textarea name="observations" rows="4" required placeholder="Record readings, tolerance checks and observations..." class="w-full border rounded-lg px-3 py-2"></textarea><div class="grid grid-cols-2 gap-3"><button type="button" data-result="VERIFIED" class="bg-green-700 text-white rounded-lg py-2.5">Pass & Issue Certificate</button><button type="button" data-result="REJECTED" class="border border-red-700 text-red-700 rounded-lg py-2.5">Reject</button></div></form>`);
  modal.querySelectorAll('[data-result]').forEach(btn=>btn.addEventListener('click',async()=>{const observations=modal.querySelector('textarea').value.trim();if(!observations)return showToast('Please enter verification observations.',false);try{await api(`/applications/${id}/verify`,{method:'POST',body:JSON.stringify({result:btn.dataset.result,observations})});if(btn.dataset.result==='VERIFIED'){const c=await api(`/applications/${id}/certificate`,{method:'POST'});showToast(`Certificate ${c.certificate.certificate_number} generated`);}else showToast('Application rejected');modal.remove();await verificationPage();}catch(e){showToast(e.message,false);}}));
}

async function assignApplication(id){const officers=window.LM_OFFICERS||[];if(!officers.length)return showToast('No LMO/GATC officers are registered.',false);const modal=addModal('assign-modal','Assign Verification Officer',`<form id="assign-form" class="space-y-3"><select id="officer" required class="w-full border rounded-lg px-3 py-2">${officers.map(o=>`<option value="${o.id}">${esc(o.name)} — ${esc(o.role)}</option>`).join('')}</select><button type="submit" class="w-full bg-[#16233F] text-white rounded-lg py-2.5">Assign</button></form>`);modal.querySelector('#assign-form').addEventListener('submit',async e=>{e.preventDefault();try{await api(`/applications/${id}/assign`,{method:'PUT',body:JSON.stringify({assigned_to:Number(modal.querySelector('#officer').value)})});modal.remove();showToast('Application assigned');await applicationPage();}catch(err){showToast(err.message,false);}});}

async function scheduleApplication(id){const modal=addModal('schedule-modal','Schedule Verification',`<form id="schedule-form" class="space-y-3"><input id="schedule-date" required type="date" min="${new Date().toISOString().slice(0,10)}" class="w-full border rounded-lg px-3 py-2"><button type="submit" class="w-full bg-[#16233F] text-white rounded-lg py-2.5">Save Schedule</button></form>`);modal.querySelector('#schedule-form').addEventListener('submit',async e=>{e.preventDefault();try{await api(`/applications/${id}/schedule`,{method:'PUT',body:JSON.stringify({scheduled_date:modal.querySelector('#schedule-date').value})});modal.remove();showToast('Verification scheduled');await applicationPage();}catch(err){showToast(err.message,false);}});}

async function reportsPage(){
  const canvas=document.querySelector('main');
  try{
    const [appsData, certData] = await Promise.all([api('/applications'), api('/certificates').catch(()=>({certificates:[]}))]);
    const apps = appsData.applications || [];
    const certs = certData.certificates || [];
    const stats = {
      applications: apps.length,
      pending: apps.filter(a => ['SUBMITTED','ASSIGNED','SCHEDULED'].includes(String(a.status||'').toUpperCase())).length,
      verified: apps.filter(a => ['VERIFIED','APPROVED'].includes(String(a.status||'').toUpperCase())).length,
      certificates: certs.length
    };

    if(canvas){
      document.getElementById('live-stats')?.remove();
      const info=document.createElement('div');
      info.id='live-stats';
      info.className='grid grid-cols-2 md:grid-cols-4 gap-4 mb-6';
      info.innerHTML=`
        <div class="p-4 rounded-xl bg-white border"><div class="text-xs text-gray-500">Applications</div><b class="text-2xl">${stats.applications}</b></div>
        <div class="p-4 rounded-xl bg-white border"><div class="text-xs text-gray-500">In Progress</div><b class="text-2xl">${stats.pending}</b></div>
        <div class="p-4 rounded-xl bg-white border"><div class="text-xs text-gray-500">Verified</div><b class="text-2xl">${stats.verified}</b></div>
        <div class="p-4 rounded-xl bg-white border"><div class="text-xs text-gray-500">Certificates</div><b class="text-2xl">${stats.certificates}</b></div>`;
      const header=canvas.querySelector('h2')?.parentElement;
      header?.after(info);

      const tbody=canvas.querySelector('table tbody');
      if(tbody){
        tbody.innerHTML = apps.length ? apps.map(a=>`
          <tr class="hover:bg-surface-container-low transition-colors">
            <td class="py-4 px-6 font-medium">${esc(a.application_number||'—')}</td>
            <td class="py-4 px-6">${esc(formatApplicationType(a.application_type))}</td>
            <td class="py-4 px-6">${fmtDate(a.submitted_at)}</td>
            <td class="py-4 px-6"><span class="px-2 py-1 rounded text-xs font-bold ${statusClass(a.status)}">${esc(a.status||'—')}</span></td>
            <td class="py-4 px-6 text-right"><button type="button" class="text-primary hover:text-primary-container font-medium text-sm" data-report-download>Download</button></td>
          </tr>`).join('') : '<tr><td colspan="5" class="p-8 text-center text-gray-500">No report data available.</td></tr>';
        tbody.querySelectorAll('[data-report-download]').forEach(b=>b.addEventListener('click',downloadReport));
      }
    }

    [...document.querySelectorAll('main button')].filter(b=>/Download|Export Data/i.test(b.innerText)).forEach(b=>b.onclick=downloadReport);
    [...document.querySelectorAll('main button')].filter(b=>/Review Applications|View Applications/i.test(b.innerText)).forEach(b=>b.onclick=()=>location.href='2-Application.html');
  }catch(e){
    if(canvas){
      const existing=canvas.querySelector('#live-stats');
      existing?.remove();
      const note=document.createElement('div');
      note.id='reports-error';
      note.className='mb-6 p-4 rounded-xl bg-white border border-red-200 text-sm text-red-700';
      note.textContent='Reports could not load live data. Please try again.';
      canvas.querySelector('#reports-error')?.remove();
      canvas.prepend(note);
    }
    showToast(e.message,false);
  }
}

async function downloadReport(){try{const response=await fetch(`${API_BASE}/reports/applications`,{headers:{Authorization:`Bearer ${getToken()}`}});if(!response.ok)throw new Error('Could not generate report');const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='applications_report.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Report exported successfully');}catch(e){showToast(e.message,false);}}

async function loadHistory(id){try{const d=await api(`/instruments/${id}/history`);const html=d.verification_history?.length?d.verification_history.map(h=>`<div class="border-b py-3"><b>${esc(h.application_number)}</b><div class="text-sm">${esc(h.status)} • ${fmtDate(h.submitted_at)}</div><div class="text-sm">Certificate: ${esc(h.certificate_number||'—')}</div></div>`).join(''):'<p>No verification history.</p>';addModal('history-modal','Verification History',html);}catch(e){showToast(e.message,false);}}

function wireCommonUI(){
  if(localStorage.getItem('lm_dark_mode')==='1')document.documentElement.classList.add('dark');
  wireUserMenu();

  const notifBtn=document.getElementById('notifBtn');
  if(notifBtn) notifBtn.onclick=(e)=>{e.preventDefault();e.stopPropagation();toggleNotifPanel(true);};
  const notifOverlay=document.getElementById('notifOverlay');
  if(notifOverlay) notifOverlay.onclick=()=>toggleNotifPanel(false);

  document.querySelectorAll('#notifPanel button').forEach(b=>{
    if(/Mark All Read/i.test(b.innerText))b.onclick=()=>{const list=document.getElementById('notifList');if(list)list.innerHTML='<p class="p-5 text-sm text-gray-500">All notifications marked as read.</p>';};
    if(/All Updates/i.test(b.innerText))b.onclick=()=>showInfo('Notification filter','Showing all workflow updates for this account.');
  });

  const user=getUser();
  document.querySelectorAll('#newApplicationBtn').forEach(btn=>{
    const ownerOnly=user?.role==='OWNER';
    btn.classList.toggle('hidden',!ownerOnly);
    btn.disabled=!ownerOnly;
    btn.onclick=ownerOnly?openApplicationModal:null;
  });
}

async function bootPage(){
  clearStaticContent();
  wireCommonUI();
  if(!getToken()){showLogin();return;}
  try{const profile=await api('/profile');localStorage.setItem('lm_user',JSON.stringify(profile));}
  catch(e){clearSession();showLogin();return;}
  const file=location.pathname.split('/').pop().toLowerCase();
  if(file.includes('dashboard'))await dashboardPage();
  else if(file.includes('application'))await applicationPage();
  else if(file.includes('verification'))await verificationPage();
  else if(file.includes('reports'))await reportsPage();
}

window.openApplicationModal=openApplicationModal;
window.openInstrumentModal=openInstrumentModal;
window.toggleSettingsMenu=toggleSettingsMenu;
window.toggleNotifPanel=toggleNotifPanel;
window.logout=logout;
window.viewApplication=viewApplication;
window.openVerification=openVerification;
window.assignApplication=assignApplication;
window.scheduleApplication=scheduleApplication;
window.loadHistory=loadHistory;
window.downloadReport=downloadReport;

document.addEventListener('DOMContentLoaded',bootPage);
