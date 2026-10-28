/* Panel del local: agenda, caja, clientes, ajustes */
(function () {
  'use strict';
  const T = Turnos;
  let S = Turnos.defaultState();
  let KEY = '';          // clave del local (modo en línea)
  let NOTIFY = null;     // estado de avisos (modo en línea)
  const REMOTE = Data.remote;
  let BARBER = '';        // en modo barbero (link propio): id del barbero
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const main = $('#main'), dlg = $('#dlg');
  const METHODS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'Mercado Pago'], ['tarjeta', 'Tarjeta']];
  const methodName = k => (METHODS.find(m => m[0] === k) || [k, k === 'seña' ? 'Seña (cobrada antes)' : k])[1];

  let tab = 'agenda';
  let day = T.dateStr(new Date());
  let barberFilter = 'all';
  let search = '';

  /* Guardado: modo local = todo el estado; modo en línea = sólo lo que cambió (config y turnos). */
  const snap = { cfg: '', appts: new Map() };
  const cfgOf = () => ({ settings: Object.assign({}, S.settings, { pin: undefined }), services: S.services, barbers: S.barbers, blocks: S.blocks });
  function takeSnap() { snap.cfg = JSON.stringify(cfgOf()); snap.appts = new Map(S.appts.map(a => [a.id, JSON.stringify(a)])); }
  let queue = Promise.resolve();
  function save() {
    if (!REMOTE) { Store.save(S); return Promise.resolve(); }
    const cfgChanged = !BARBER && JSON.stringify(cfgOf()) !== snap.cfg;
    const changed = S.appts.filter(a => snap.appts.get(a.id) !== JSON.stringify(a));
    const isNew = new Set(changed.filter(a => !snap.appts.has(a.id)).map(a => a.id));
    const cfg = cfgOf();
    takeSnap();
    queue = queue.then(async () => {
      try {
        if (cfgChanged) { const r = await Data.adminSaveConfig(KEY, cfg); if (r && r.ok === false) throw new Error('cfg'); }
        for (const a of changed) {
          const r = await (BARBER ? Data.barberPut(KEY, a, isNew.has(a.id)) : Data.adminPutAppt(KEY, a, isNew.has(a.id)));
          if (!r.ok) { toast(r.error || 'No se pudo guardar el turno'); await reload(); return; }
        }
      } catch (e) { toast('No se pudo guardar. Revisá la conexión.'); await reload(); }
    });
    return queue;
  }
  const refresh = () => { if (!REMOTE) S = Store.load(); };
  async function reload() {
    if (!REMOTE) { S = Store.load(); render(); return; }
    try { const r = await (BARBER ? Data.barberLoad(KEY) : Data.adminLoad(KEY)); S = r.state; NOTIFY = r.notify; takeSnap(); render(); }
    catch (e) { toast('No se pudo actualizar. Revisá la conexión.'); }
  }
  function toast(msg) {
    const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
    document.body.appendChild(t); setTimeout(() => t.remove(), 2400);
  }
  function brand() {
    const st = S.settings, root = document.documentElement.style;
    root.setProperty('--accent', st.accent || '#c8a24a');
    const h = (st.accent || '#c8a24a').replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    root.setProperty('--accent-ink', (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1405' : '#ffffff');
    $('#shop').textContent = st.name;
    document.title = 'Panel · ' + st.name;
  }

  /* ---------- Acceso ---------- */
  const keyName = () => 'turnos.k.' + Data.slug;
  const bkeyName = () => 'turnos.b.' + Data.slug;
  function authed() {
    if (REMOTE) return !!KEY;
    try { return sessionStorage.getItem('turnos.auth') === S.settings.pin; } catch (e) { return false; }
  }
  async function loginRemote(key, asBarber) {
    try {
      const r = asBarber ? await Data.barberLoad(key) : await Data.adminLoad(key);
      KEY = key; S = r.state; NOTIFY = r.notify; BARBER = asBarber ? r.barberId : '';
      try { localStorage.setItem(asBarber ? bkeyName() : keyName(), key); } catch (e) { /* ok */ }
      takeSnap();
      if (!asBarber && !r.configured) await save_defaults();
      return true;
    } catch (e) { return String(e.message || '').includes('auth') ? false : null; }
  }
  async function save_defaults() { const r = await Data.adminSaveConfig(KEY, cfgOf()); takeSnap(); return r; }
  async function gate() {
    $('#clientLink').href = 'index.html' + location.search; $('#clientLink2').href = 'index.html' + location.search;
    if (REMOTE) {
      $('#loginHelp').textContent = 'Ingresá la clave de tu local';
      $('#pin').type = 'password'; $('#pin').inputMode = 'text';
      if (!KEY) {
        let k = '', asB = false;
        const h = location.hash.match(/([kb])=([a-f0-9]+)/);
        if (h) { k = h[2]; asB = h[1] === 'b'; history.replaceState(null, '', location.pathname + location.search); }
        if (!k) { try { k = localStorage.getItem(keyName()) || ''; } catch (e) { /* ok */ } }
        if (!k) { try { k = localStorage.getItem(bkeyName()) || ''; asB = !!k; } catch (e) { /* ok */ } }
        if (k) { const ok = await loginRemote(k, asB); if (ok === false) { try { localStorage.removeItem(asB ? bkeyName() : keyName()); } catch (e) { /* ok */ } } }
      }
      if (KEY) { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); render(); return; }
      $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#pin').focus(); return;
    }
    S = Store.load();
    if (authed()) { $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); render(); }
    else { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); $('#pin').focus(); }
  }
  async function tryPin() {
    const v = $('#pin').value.trim();
    if (REMOTE) {
      const ok = await loginRemote(v);
      if (ok === true) { $('#pinErr').classList.add('hidden'); gate(); }
      else { $('#pinErr').textContent = ok === null ? 'No hay conexión. Probá de nuevo.' : 'PIN o clave incorrectos'; $('#pinErr').classList.remove('hidden'); }
      return;
    }
    refresh();
    if (v === S.settings.pin) { try { sessionStorage.setItem('turnos.auth', S.settings.pin); } catch (e) { /* sin sesión */ } $('#pinErr').classList.add('hidden'); gate(); }
    else $('#pinErr').classList.remove('hidden');
  }
  $('#pinBtn').addEventListener('click', tryPin);
  $('#pin').addEventListener('keydown', e => { if (e.key === 'Enter') tryPin(); });

  /* ---------- Diálogos ---------- */
  function openDlg(html, onSubmit) {
    dlg.innerHTML = '<form method="dialog" id="df" class="stack">' + html + '</form>';
    const f = $('#df');
    f.addEventListener('submit', e => { e.preventDefault(); if (onSubmit && onSubmit(f) === false) return; closeDlg(); });
    dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeDlg));
    if (typeof dlg.showModal === 'function') { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    return f;
  }
  function closeDlg() { if (typeof dlg.close === 'function') dlg.close(); else dlg.removeAttribute('open'); dlg.innerHTML = ''; }
  const dlgButtons = (ok) => '<div class="row"><button type="button" class="btn grow" data-close>Cancelar</button><button class="btn primary grow" type="submit">' + ok + '</button></div>';

  /* ---------- Agenda ---------- */
  function statusBadge(a) {
    if (T.expired(a, S, Date.now())) return '<span class="badge bad">Seña vencida</span>';
    return ({ confirmada: '<span class="badge ok">Confirmado</span>', pendiente: '<span class="badge warn">Falta seña</span>', atendida: '<span class="badge ok">Atendido</span>',
      noshow: '<span class="badge bad">No vino</span>', cancelada: '<span class="badge">Cancelado</span>' })[a.status] || '';
  }
  function apptRow(a) {
    const cls = a.status === 'atendida' ? ' done' : (a.status === 'cancelada' || a.status === 'noshow' || T.expired(a, S, Date.now())) ? ' cancel' : '';
    const stats = a.phone ? T.clientStats(S, a.phone) : null;
    const acts = [];
    const wa = (txt) => a.phone ? '<a class="btn sm" target="_blank" rel="noopener" data-act="wa" data-id="' + a.id + '" href="' + T.waLink(a.phone, txt) + '">WhatsApp</a>' : '';
    if (a.status === 'confirmada') acts.push('<button class="btn sm primary" data-act="cobrar" data-id="' + a.id + '">Atendido</button>', '<button class="btn sm" data-act="noshow" data-id="' + a.id + '">No vino</button>', wa(T.reminderMsg(S, a)), '<button class="btn sm danger" data-act="cancel" data-id="' + a.id + '">Cancelar</button>');
    else if (a.status === 'pendiente') acts.push('<button class="btn sm primary" data-act="sena" data-id="' + a.id + '">Seña recibida</button>', wa(T.confirmMsg(S, a)), '<button class="btn sm danger" data-act="cancel" data-id="' + a.id + '">Cancelar</button>');
    else if (a.status === 'atendida' || a.status === 'noshow') acts.push('<button class="btn sm ghost" data-act="undo" data-id="' + a.id + '">Deshacer</button>');
    return '<div class="appt' + cls + '"><div class="time">' + a.start + '<small>' + T.fromMin(T.toMin(a.start) + a.duration) + '</small></div><div>' +
      '<div class="row between wrapx"><b>' + esc(a.name) + '</b>' + statusBadge(a) + '</div>' +
      '<div class="muted small">' + esc(a.serviceName) + ' · ' + esc(T.barberName(S, a.barberId)) + ' · ' + T.money(a.price) + (a.source === 'online' ? ' · online' : a.source === 'walkin' ? ' · sin turno' : '') + '</div>' +
      (a.phone ? '<div class="muted small">' + esc(a.phone) + (stats && stats.noshows ? ' · <span style="color:var(--bad)">faltó ' + stats.noshows + ' vez/veces</span>' : '') + (stats && stats.visits ? ' · ' + stats.visits + ' visitas' : '') + '</div>' : '') +
      (a.deposit ? '<div class="small" style="color:var(--warn)">Seña ' + T.money(a.deposit.amount) + (a.deposit.paid ? ' ✓ recibida' : ' pendiente') + '</div>' : '') +
      (a.notes ? '<div class="small">📝 ' + esc(a.notes) + '</div>' : '') +
      (a.payment ? '<div class="small muted">Cobrado: ' + methodName(a.payment.method) + (a.payment.tip ? ' · propina ' + T.money(a.payment.tip) : '') + '</div>' : '') +
      '<div class="acts">' + acts.join('') + '</div></div></div>';
  }

  function renderAgenda() {
    const list = S.appts.filter(a => a.date === day && (barberFilter === 'all' || a.barberId === barberFilter)).sort((a, b) => a.start.localeCompare(b.start));
    const live = list.filter(a => T.blocksSlot(a, S, Date.now()));
    const expected = live.reduce((t, a) => t + a.price, 0);
    const tomorrow = T.addDays(T.dateStr(new Date()), 1);
    const nRem = S.appts.filter(a => a.date === tomorrow && a.status === 'confirmada' && a.phone && !a.reminded).length;
    const blocks = S.blocks.filter(b => b.date === day && (!BARBER || !b.barberId || b.barberId === BARBER));
    main.innerHTML =
      '<div class="row wrapx" style="margin-bottom:12px"><button class="btn sm" data-act="prev" aria-label="Día anterior">◀</button><input type="date" id="dayPick" value="' + day + '" style="width:auto;min-height:38px" aria-label="Fecha"><button class="btn sm" data-act="next" aria-label="Día siguiente">▶</button><button class="btn sm" data-act="today">Hoy</button><b class="grow" style="text-align:right;text-transform:capitalize">' + T.dateLabel(day) + '</b></div>' +
      '<div class="row wrapx" style="margin-bottom:12px"><button class="btn primary sm" data-act="new">+ Turno</button><button class="btn sm" data-act="walkin">Cliente sin turno</button>' + (BARBER ? '' : '<button class="btn sm" data-act="block">Bloquear horario</button>') +
      '<button class="btn sm" data-act="remind">Recordatorios de mañana' + (nRem ? ' (' + nRem + ')' : '') + '</button></div>' +
      '<div class="kpis" style="margin-bottom:12px"><div class="kpi"><b>' + live.length + '</b><span>turnos</span></div><div class="kpi"><b>' + T.money(expected) + '</b><span>previsto del día</span></div><div class="kpi"><b>' + list.filter(a => a.status === 'pendiente' && !T.expired(a, S, Date.now())).length + '</b><span>esperando seña</span></div></div>' +
      (S.barbers.length > 1 && !BARBER ? '<div class="chips" style="margin-bottom:12px"><button class="chip' + (barberFilter === 'all' ? ' sel' : '') + '" data-act="bf" data-id="all">Todos</button>' + S.barbers.filter(b => b.active !== false).map(b => '<button class="chip' + (barberFilter === b.id ? ' sel' : '') + '" data-act="bf" data-id="' + b.id + '">' + esc(b.name) + '</button>').join('') + '</div>' : '') +
      blocks.map(b => '<div class="notice" style="margin-bottom:8px">⛔ ' + (b.barberId ? esc(T.barberName(S, b.barberId)) : 'Todo el local') + ': ' + (b.start === '00:00' && b.end === '24:00' ? 'todo el día' : b.start + '–' + b.end) + (b.reason ? ' · ' + esc(b.reason) : '') + (BARBER ? '' : ' <button class="btn sm ghost" data-act="delblock" data-id="' + b.id + '">Quitar</button>') + '</div>').join('') +
      (list.length ? list.map(apptRow).join('') : '<div class="card center muted">No hay turnos este día.</div>');
  }

  /* ---------- Caja ---------- */
  function renderCaja() {
    const r = T.dayReport(S, day);
    const methods = Object.keys(r.byMethod);
    main.innerHTML =
      '<div class="row wrapx" style="margin-bottom:12px"><button class="btn sm" data-act="prev">◀</button><input type="date" id="dayPick" value="' + day + '" style="width:auto;min-height:38px" aria-label="Fecha"><button class="btn sm" data-act="next">▶</button><button class="btn sm" data-act="today">Hoy</button></div>' +
      '<div class="kpis" style="margin-bottom:16px"><div class="kpi"><b>' + T.money(r.total) + '</b><span>facturado (' + r.done + ' atendidos)</span></div><div class="kpi"><b>' + T.money(r.tips) + '</b><span>propinas</span></div>' +
      '<div class="kpi"><b>' + T.money(r.expected) + '</b><span>falta atender</span></div><div class="kpi"><b>' + r.noshows + '</b><span>no vinieron (' + T.money(r.lostNoShow) + ' perdidos)</span></div></div>' +
      '<div class="card" style="margin-bottom:12px"><h3>Por medio de pago</h3>' + (methods.length ? '<table><tbody>' + methods.map(m => '<tr><td>' + esc(methodName(m)) + '</td><td class="num">' + T.money(r.byMethod[m]) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">Todavía no hay cobros.</p>') + '</div>' +
      '<div class="card"><h3>Por barbero y comisión</h3><table><thead><tr><th>Barbero</th><th class="num">Cortes</th><th class="num">Facturó</th><th class="num">Comisión</th><th class="num">Propinas</th></tr></thead><tbody>' +
      Object.values(r.byBarber).map(b => '<tr><td>' + esc(b.name) + '</td><td class="num">' + b.count + '</td><td class="num">' + T.money(b.revenue) + '</td><td class="num">' + T.money(b.commission) + '</td><td class="num">' + T.money(b.tips) + '</td></tr>').join('') + '</tbody></table></div>' +
      '<div class="row wrapx" style="margin-top:14px"><button class="btn" data-act="csv">Descargar historial de cobros (CSV)</button></div>';
  }
  function exportCsv() {
    const rows = [['Fecha', 'Hora', 'Cliente', 'Teléfono', 'Servicio', 'Barbero', 'Precio', 'Medio', 'Propina', 'Seña pagada']];
    S.appts.filter(a => a.status === 'atendida').sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).forEach(a =>
      rows.push([a.date, a.start, a.name, a.phone, a.serviceName, T.barberName(S, a.barberId), a.price, a.payment ? a.payment.method : '', a.payment ? a.payment.tip : 0, a.deposit && a.deposit.paid ? a.deposit.amount : 0]));
    Store.download('cobros.csv', '﻿' + rows.map(r => r.map(c => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n'), 'text/csv');
  }

  /* ---------- Clientes ---------- */
  function renderClientes() {
    const map = new Map();
    S.appts.forEach(a => { if (a.phone) map.set(a.phone, a.name); });
    let list = [...map.entries()].map(([phone, name]) => Object.assign({ phone, name }, T.clientStats(S, phone)));
    const q = search.toLowerCase();
    if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || c.phone.includes(q));
    list.sort((a, b) => (b.last || '').localeCompare(a.last || '') || b.visits - a.visits);
    main.innerHTML = '<input id="q" placeholder="Buscar por nombre o teléfono" value="' + esc(search) + '" aria-label="Buscar cliente" style="margin-bottom:12px">' +
      (list.length ? list.map(c => '<div class="card row between wrapx" style="margin-bottom:8px"><div><b>' + esc(c.name) + '</b>' + (c.noshows ? ' <span class="badge bad">faltó ' + c.noshows + '</span>' : '') + '<div class="muted small">' + c.phone + ' · ' + c.visits + ' visitas · ' + T.money(c.spent) + (c.last ? ' · última ' + T.dateLabel(c.last) : '') + '</div></div><a class="btn sm" target="_blank" rel="noopener" href="' + T.waLink(c.phone) + '">WhatsApp</a></div>').join('') : '<div class="card center muted">Todavía no hay clientes registrados.</div>');
    const qi = $('#q'); if (qi) { qi.addEventListener('input', e => { search = e.target.value; const pos = e.target.selectionStart; renderClientes(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); }); }
  }

  /* ---------- Ajustes ---------- */
  function fld(label, key, type, extra) {
    const [g, k] = key.split('.');
    const v = S[g][k];
    return '<div class="field"><label>' + label + '</label><input data-k="' + key + '" ' + (type === 'num' ? 'type="number" inputmode="numeric" data-num="1"' : type === 'color' ? 'type="color"' : 'type="text"') + ' value="' + esc(v) + '" ' + (extra || '') + '></div>';
  }
  function renderAjustes() {
    if (BARBER) { renderAjustesBarbero(); return; }
    const st = S.settings;
    const base = location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, '');
    const link = base + 'index.html' + (REMOTE ? '?s=' + Data.slug : '');
    const sel = (key, opts) => { const [g, k] = key.split('.'); return '<select data-k="' + key + '">' + opts.map(o => '<option value="' + o[0] + '"' + (String(S[g][k]) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>'; };
    main.innerHTML = '<div class="stack">' +
      (!REMOTE && st.pin === '1234' ? '<div class="notice">Estás usando el PIN de fábrica (1234). Cambialo en "Seguridad" antes de usarlo en el local.</div>' : '') +
      (!REMOTE ? '<div class="notice">Modo demostración: los datos quedan sólo en este celular. Para usar el sistema con clientes reales abrí el panel con el link de tu local.</div>' : '') +
      '<div class="card stack"><h3>Link para tus clientes</h3><input readonly value="' + esc(link) + '" id="lnk" aria-label="Link de reservas"><div class="row"><button class="btn grow" data-act="copylink">Copiar link</button><a class="btn grow" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent('Reservá tu turno en ' + st.name + ': ' + link) + '">Compartir por WhatsApp</a></div><p class="muted small" style="margin:0">Ponelo en tu bio de Instagram y en el estado de WhatsApp.</p></div>' +
      '<details class="card" open><summary>Datos del local</summary><div class="stack" style="margin-top:12px">' + fld('Nombre', 'settings.name') + fld('Frase corta', 'settings.tagline') + fld('Dirección', 'settings.address') +
      fld('WhatsApp del local (con código de área)', 'settings.whatsapp', null, 'placeholder="3794 123456" inputmode="tel"') + fld('Instagram (sin @)', 'settings.instagram') + fld('Color de marca', 'settings.accent', 'color') + '</div></details>' +
      '<details class="card"><summary>Reglas de reservas y señas</summary><div class="stack" style="margin-top:12px">' +
      '<div class="field"><label>Intervalo entre horarios (min)</label>' + sel('settings.slotStep', [[10, '10'], [15, '15'], [20, '20'], [30, '30']]) + '</div>' +
      fld('Hasta cuántos días adelante se puede reservar', 'settings.advanceDays', 'num') + fld('Aviso mínimo para reservar (minutos)', 'settings.minNoticeMin', 'num') +
      fld('Cancelación gratis hasta (horas antes)', 'settings.cancelHours', 'num') +
      '<div class="field"><label>Seña para reservar</label>' + sel('settings.depositMode', [['off', 'No pedir seña'], ['repeat', 'Sólo a quien faltó antes (recomendado)'], ['always', 'A todos']]) + '</div>' +
      fld('Porcentaje de seña (%)', 'settings.depositPct', 'num') + fld('Minutos que se retiene el horario esperando la seña', 'settings.holdMin', 'num') +
      '<div class="field"><label>Cómo pagar la seña (alias, CBU o link de Mercado Pago)</label><textarea data-k="settings.payInfo" rows="2">' + esc(st.payInfo) + '</textarea></div></div></details>' +
      '<details class="card"><summary>Servicios (' + S.services.length + ')</summary><div class="stack" style="margin-top:12px">' + S.services.map((s, i) =>
        '<div class="card stack"><div class="field"><label>Nombre</label><input data-k="services.' + i + '.name" value="' + esc(s.name) + '"></div><div class="grid2"><div class="field"><label>Minutos</label><input type="number" inputmode="numeric" data-num="1" data-k="services.' + i + '.duration" value="' + s.duration + '"></div><div class="field"><label>Precio $</label><input type="number" inputmode="numeric" data-num="1" data-k="services.' + i + '.price" value="' + s.price + '"></div></div>' +
        '<div class="row between"><label class="row" style="margin:0"><input type="checkbox" style="width:auto;min-height:0" data-k="services.' + i + '.active"' + (s.active !== false ? ' checked' : '') + '> Visible para clientes</label><button class="btn sm danger" data-act="delsvc" data-i="' + i + '">Eliminar</button></div></div>').join('') +
      '<button class="btn" data-act="addsvc">+ Agregar servicio</button></div></details>' +
      '<details class="card"><summary>Barberos y horarios (' + S.barbers.length + ')</summary><div class="stack" style="margin-top:12px">' + S.barbers.map((b, i) =>
        '<div class="card stack"><div class="grid2"><div class="field"><label>Nombre</label><input data-k="barbers.' + i + '.name" value="' + esc(b.name) + '"></div><div class="field"><label>Comisión %</label><input type="number" inputmode="numeric" data-num="1" data-k="barbers.' + i + '.commissionPct" value="' + b.commissionPct + '"></div></div>' +
        '<div class="hours">' + [1, 2, 3, 4, 5, 6, 0].map(d => '<b>' + T.DOW_SHORT[d] + '</b><input data-hours="' + i + '.' + d + '" value="' + esc(T.rangesToText(b.schedule[d])) + '" placeholder="Cerrado — o 09:00-13:00, 16:00-20:00" aria-label="Horario ' + T.DOW[d] + '">').join('') + '</div>' +
        '<div class="row between"><label class="row" style="margin:0"><input type="checkbox" style="width:auto;min-height:0" data-k="barbers.' + i + '.active"' + (b.active !== false ? ' checked' : '') + '> Atiende</label><span class="row"><button class="btn sm" data-act="barberlink" data-i="' + i + '">Link del barbero</button><button class="btn sm danger" data-act="delbarber" data-i="' + i + '">Eliminar</button></span></div></div>').join('') +
      '<button class="btn" data-act="addbarber">+ Agregar barbero</button></div></details>' +
      '<details class="card"><summary>Horarios bloqueados (' + S.blocks.filter(b => b.date >= T.dateStr(new Date())).length + ')</summary><div class="stack" style="margin-top:12px">' +
      (S.blocks.filter(b => b.date >= T.dateStr(new Date())).sort((a, b) => a.date.localeCompare(b.date)).map(b => '<div class="row between"><span>' + T.dateLabel(b.date) + ' · ' + (b.barberId ? esc(T.barberName(S, b.barberId)) : 'todo el local') + ' · ' + (b.start === '00:00' && b.end === '24:00' ? 'todo el día' : b.start + '–' + b.end) + (b.reason ? ' · ' + esc(b.reason) : '') + '</span><button class="btn sm danger" data-act="delblock" data-id="' + b.id + '">Quitar</button></div>').join('') || '<span class="muted">Ninguno.</span>') + '</div></details>' +
      (REMOTE ? notifyCard() : '') +
      (REMOTE ? '<details class="card"><summary>Seguridad</summary><div class="stack" style="margin-top:12px"><p class="muted small" style="margin:0">Este dispositivo recuerda la clave de tu local. Si es un equipo compartido, cerrá la sesión al terminar.</p><button class="btn" data-act="logout">Cerrar sesión</button></div></details>'
        : '<details class="card"><summary>Seguridad</summary><div class="stack" style="margin-top:12px"><div class="field"><label>PIN del panel (4 a 8 números)</label><input data-k="settings.pin" inputmode="numeric" value="' + esc(st.pin) + '"></div><p class="muted small" style="margin:0">El PIN protege el panel en este dispositivo.</p></div></details>') +
      '<details class="card"><summary>Tus datos</summary><div class="stack" style="margin-top:12px"><p class="muted small" style="margin:0">Los datos son tuyos: bajá una copia cuando quieras y no dependés de ninguna plataforma.</p>' +
      '<button class="btn" data-act="export">Descargar copia de seguridad</button>' +
      (REMOTE ? '' : '<label class="btn" style="text-align:center;margin:0">Restaurar copia<input type="file" id="imp" accept=".json,application/json" class="hidden"></label>' +
      '<button class="btn" data-act="demo">Cargar datos de ejemplo</button><button class="btn danger" data-act="wipe">Borrar todo y empezar de cero</button>') + '</div></details></div>';
  }

  function renderAjustesBarbero() {
    const base = location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, '');
    const link = base + 'index.html?s=' + Data.slug;
    main.innerHTML = '<div class="stack"><div class="card stack"><h3>Hola, ' + esc(T.barberName(S, BARBER)) + '</h3><p class="muted small" style="margin:0">Acá ves y manejás tu agenda. Los precios, horarios y avisos los maneja el dueño del local.</p></div>' +
      '<div class="card stack"><h3>Link para tus clientes</h3><input readonly value="' + esc(link) + '" id="lnk" aria-label="Link de reservas"><button class="btn" data-act="copylink">Copiar link</button></div>' +
      infoCard() +
      '<button class="btn" data-act="logout">Cerrar sesión</button></div>';
  }

  function infoCard() {
    const st = S.settings;
    const f = (id, label, v, extra) => '<div class="field"><label>' + label + '</label><input id="' + id + '" value="' + esc(v) + '" ' + (extra || '') + '></div>';
    return '<div class="card stack"><h3>Datos del local</h3><p class="muted small" style="margin:0">Lo que cargues acá lo ven los clientes en la página de reservas.</p>' +
      f('inf-name', 'Nombre de la barbería', st.name) + f('inf-tagline', 'Frase corta', st.tagline) + f('inf-address', 'Dirección', st.address) +
      f('inf-whatsapp', 'WhatsApp del local (con código de área)', st.whatsapp, 'inputmode="tel" placeholder="3794 123456"') + f('inf-instagram', 'Instagram (sin @)', st.instagram) +
      '<button class="btn primary" data-act="infosave">Guardar datos</button></div>';
  }
  async function infoSave() {
    const v = id => ($('#' + id).value || '').trim();
    const info = { name: v('inf-name'), tagline: v('inf-tagline'), address: v('inf-address'), whatsapp: v('inf-whatsapp'), instagram: v('inf-instagram').replace('@', '') };
    if (info.name.length < 2) { toast('Poné el nombre de la barbería'); return; }
    const r = await Data.barberInfo(KEY, info);
    if (r && r.ok === false) { toast(r.error || 'No se pudo guardar'); return; }
    toast('Datos guardados'); await reload();
  }

  async function dlgBarberLink(i) {
    const b = S.barbers[i];
    await queue; // asegura que el barbero ya esté guardado en la base
    const r = await Data.barberKey(KEY, b.id);
    if (!r || r.ok === false) { toast('No se pudo crear el link. Revisá la conexión e intentá de nuevo.'); return; }
    const base = location.href.replace(/admin\.html.*$/, '').replace(/[?#].*$/, '');
    const link = base + 'admin.html?s=' + Data.slug + '#b=' + r.key;
    const msg = 'Hola ' + b.name + '! Este es tu link para ver tu agenda de turnos en ' + S.settings.name + ' (es personal, no lo compartas): ' + link;
    openDlg('<h2>Link de ' + esc(b.name) + '</h2><p class="muted small" style="margin:0">Mandáselo por WhatsApp. Con ese link ve y maneja sólo su agenda. Si generás otro link para el mismo barbero, el anterior deja de funcionar.</p>' +
      '<input readonly value="' + esc(link) + '" id="blnk" aria-label="Link del barbero">' +
      '<a class="btn primary block" target="_blank" rel="noopener" href="https://wa.me/?text=' + encodeURIComponent(msg) + '">Enviar por WhatsApp</a>' +
      '<button type="button" class="btn block" data-act="copyblink">Copiar link</button><button type="button" class="btn block" data-close>Cerrar</button>', null);
  }

  function notifyCard() {
    const n = NOTIFY || {};
    return '<details class="card"><summary>Avisos automáticos (Telegram y mail)</summary><div class="stack" style="margin-top:12px">' +
      '<p class="muted small" style="margin:0">Cada turno nuevo, cancelación o cambio te llega por Telegram, y a las 20:00 te mandamos la lista de mañana con los links de WhatsApp listos. Si el cliente deja su email, recibe confirmación y recordatorio.</p>' +
      '<div class="row"><span class="badge ' + (n.telegram ? 'ok' : '') + '">Telegram: ' + (n.telegram ? 'conectado' : 'sin conectar') + '</span><span class="badge ' + (n.email ? 'ok' : '') + '">Mail: ' + (n.email ? 'conectado' : 'sin conectar') + '</span></div>' +
      '<div class="field"><label>Telegram: token del bot (se crea con @BotFather)</label><input id="tgTok" type="password" autocomplete="off" placeholder="' + (n.telegram ? 'Guardado (dejá vacío para no cambiarlo)' : '123456:ABC…') + '"></div>' +
      '<div class="field"><label>Telegram: tu número de chat</label><div class="row"><input id="tgChat" inputmode="numeric" placeholder="' + (n.telegram ? 'Guardado' : 'Se detecta solo') + '"><button class="btn sm" data-act="tgdetect">Detectar</button></div><p class="muted small" style="margin:4px 0 0">Primero escribile cualquier mensaje a tu bot, después tocá Detectar.</p></div>' +
      '<div class="field"><label>Mail: clave de Resend (resend.com, plan gratis)</label><input id="reKey" type="password" autocomplete="off" placeholder="' + (n.email ? 'Guardada (dejá vacío para no cambiarla)' : 're_…') + '"></div>' +
      '<div class="field"><label>Mail: remitente (ej: Mi Barbería &lt;turnos@tudominio.com&gt;)</label><input id="reFrom" value="' + esc(n.mailFrom || '') + '"></div>' +
      '<div class="row"><button class="btn primary grow" data-act="notifysave">Guardar</button><button class="btn grow" data-act="notifytest">Enviar prueba</button></div></div></details>';
  }
  async function notifySave() {
    const v = id => { const e = $(id); return e && e.value.trim() ? e.value.trim() : null; };
    const r = await Data.setNotify(KEY, { token: v('#tgTok'), chat: v('#tgChat'), resend: v('#reKey'), from: $('#reFrom') ? $('#reFrom').value.trim() : null });
    if (r && r.ok === false) { toast(r.error || 'No se pudo guardar'); return; }
    toast('Avisos guardados'); await reload();
  }
  async function tgDetect() {
    const tok = $('#tgTok').value.trim();
    if (!tok) { toast('Pegá primero el token del bot'); return; }
    try {
      const r = await fetch('https://api.telegram.org/bot' + encodeURIComponent(tok) + '/getUpdates').then(x => x.json());
      if (!r.ok) { toast('El token no es válido'); return; }
      const m = (r.result || []).map(u => (u.message || u.my_chat_member || {}).chat).filter(Boolean).pop();
      if (!m) { toast('Todavía no le escribiste al bot. Mandale un mensaje y probá de nuevo.'); return; }
      $('#tgChat').value = m.id; toast('Chat detectado: ' + (m.first_name || m.title || m.id));
    } catch (e) { toast('No se pudo consultar Telegram. Pegá el número a mano.'); }
  }

  function setPath(path, raw, el) {
    const parts = path.split('.'); let o = S;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    const k = parts[parts.length - 1];
    if (el.type === 'checkbox') o[k] = el.checked;
    else if (el.dataset.num) { const n = Number(raw); if (!isFinite(n) || n < 0) { toast('Ingresá un número válido'); el.value = o[k]; return false; } o[k] = n; }
    else o[k] = raw;
    return true;
  }
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'dayPick') { if (el.value) { day = el.value; render(); } return; }
    if (el.id === 'imp') { importFile(el.files[0]); return; }
    if (el.dataset.hours) {
      const [bi, d] = el.dataset.hours.split('.'); const r = T.parseRanges(el.value);
      if (r === null) { toast('Formato: 09:00-13:00, 16:00-20:00'); el.value = T.rangesToText(S.barbers[bi].schedule[d]); return; }
      S.barbers[bi].schedule[d] = r; save(); toast('Guardado'); return;
    }
    if (el.dataset.k) {
      if (el.dataset.k === 'settings.pin' && !REMOTE && !/^\d{4,8}$/.test(el.value)) { toast('El PIN debe tener de 4 a 8 números'); el.value = S.settings.pin; return; }
      if (setPath(el.dataset.k, el.value, el)) {
        if (el.dataset.k === 'settings.pin') { try { sessionStorage.setItem('turnos.auth', S.settings.pin); } catch (x) { /* ok */ } }
        save(); brand(); toast('Guardado');
      }
    }
  });

  function importFile(f) {
    if (!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.appts) || !Array.isArray(d.services) || !Array.isArray(d.barbers) || !d.settings) throw new Error('formato');
        S = d; save(); brand(); render(); toast('Copia restaurada');
      } catch (x) { toast('Ese archivo no es una copia válida'); }
    };
    rd.readAsText(f);
  }

  /* ---------- Datos de ejemplo ---------- */
  function seedDemo() {
    const st = T.defaultState();
    st.settings.name = 'Barbería Don Lucho'; st.settings.tagline = 'Cortes clásicos y barba · Reservá online';
    st.settings.address = 'Centro'; st.settings.depositMode = 'repeat'; st.settings.payInfo = 'Alias: donlucho.barberia';
    st.barbers[0].name = 'Lucho'; st.barbers[1].name = 'Mati';
    S = st;
    const today = T.dateStr(new Date()), yest = T.addDays(today, -1), tom = T.addDays(today, 1);
    const names = ['Nacho', 'Fede', 'Tomás', 'Agus', 'Bruno', 'Lautaro', 'Mauro', 'Dani'];
    const mk = (date, start, svc, b, name, i) => T.createAppointment(S, { admin: true, date, start, serviceId: svc, barberId: b, name, phone: '37940' + String(10000 + i * 137).slice(0, 5), source: 'online' });
    let i = 1;
    [['10:00', 'corte', 'b1'], ['10:30', 'corte-barba', 'b2'], ['11:15', 'barba', 'b1'], ['16:00', 'corte', 'b2'], ['17:00', 'corte-barba', 'b1']].forEach((x, k) => {
      const r = mk(yest, x[0], x[1], x[2], names[k], i++); if (r.ok) T.complete(S, r.appt.id, { method: k % 2 ? 'mercadopago' : 'efectivo', tip: k === 1 ? 500 : 0 });
    });
    const ns = mk(yest, '18:00', 'corte', 'b2', 'Gonzalo', i++); if (ns.ok) T.setStatus(S, ns.appt.id, 'noshow');
    [['16:30', 'corte', 'b1'], ['17:15', 'corte-barba', 'b2'], ['18:00', 'perfilado', 'b1']].forEach((x, k) => mk(today, x[0], x[1], x[2], names[3 + k], i++));
    [['10:00', 'corte', 'b1'], ['10:45', 'barba', 'b2'], ['16:00', 'corte-barba', 'b1']].forEach((x, k) => mk(tom, x[0], x[1], x[2], names[5 + k], i++));
    save(); brand();
  }

  /* ---------- Acciones ---------- */
  function actOn(id, fn, msg) { refresh(); const r = fn(); if (r && r.ok === false) { toast(r.error || 'No se pudo'); return; } save(); render(); if (msg) toast(msg); }
  const A = id => S.appts.find(a => a.id === id);

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    if (act === 'prev') { day = T.addDays(day, -1); render(); }
    else if (act === 'next') { day = T.addDays(day, 1); render(); }
    else if (act === 'today') { day = T.dateStr(new Date()); render(); }
    else if (act === 'bf') { barberFilter = id; render(); }
    else if (act === 'cobrar') dlgCobrar(A(id));
    else if (act === 'noshow') actOn(id, () => T.setStatus(S, id, 'noshow'), 'Marcado como no vino');
    else if (act === 'cancel') { if (window.confirm('¿Cancelar este turno?')) actOn(id, () => T.setStatus(S, id, 'cancelada'), 'Turno cancelado'); }
    else if (act === 'sena') actOn(id, () => T.confirmDeposit(S, id), 'Seña confirmada');
    else if (act === 'undo') actOn(id, () => { const a = A(id); a.status = 'confirmada'; delete a.payment; return a; });
    else if (act === 'wa') { const a = A(id); if (a && a.status === 'confirmada') { a.reminded = true; save(); } }
    else if (act === 'new') dlgNuevo();
    else if (act === 'walkin') dlgWalkin();
    else if (act === 'block') dlgBlock();
    else if (act === 'remind') dlgRemind();
    else if (act === 'delblock') { S.blocks = S.blocks.filter(b => b.id !== id); save(); render(); toast('Bloqueo quitado'); }
    else if (act === 'csv') exportCsv();
    else if (act === 'logout') { try { localStorage.removeItem(keyName()); localStorage.removeItem(bkeyName()); } catch (x) { /* ok */ } KEY = ''; location.reload(); }
    else if (act === 'notifysave') notifySave();
    else if (act === 'tgdetect') tgDetect();
    else if (act === 'notifytest') { Data.testNotify(KEY).then(r => toast(r && r.ok === false ? (r.error || 'No se pudo') : 'Prueba enviada: revisá Telegram')); }
    else if (act === 'copylink') { const i = $('#lnk'); i.select(); try { navigator.clipboard.writeText(i.value); } catch (x) { document.execCommand('copy'); } toast('Link copiado'); }
    else if (act === 'addsvc') { S.services.push({ id: 's' + T.uid(), name: 'Nuevo servicio', duration: 30, price: 5000, active: true }); save(); render(); }
    else if (act === 'delsvc') { const i = Number(el.dataset.i); if (window.confirm('¿Eliminar "' + S.services[i].name + '"? Los turnos ya dados se conservan.')) { S.services.splice(i, 1); save(); render(); } }
    else if (act === 'addbarber') { S.barbers.push({ id: 'b' + T.uid(), name: 'Nuevo barbero', commissionPct: 50, active: true, schedule: JSON.parse(JSON.stringify(S.barbers[0] ? S.barbers[0].schedule : T.defaultState().barbers[0].schedule)) }); save(); render(); }
    else if (act === 'delbarber') { const i = Number(el.dataset.i); if (S.barbers.length <= 1) { toast('Tiene que haber al menos un barbero'); return; } if (window.confirm('¿Eliminar a ' + S.barbers[i].name + '? Sus turnos futuros seguirán en la agenda.')) { S.barbers.splice(i, 1); save(); render(); } }
    else if (act === 'infosave') infoSave();
    else if (act === 'barberlink') dlgBarberLink(Number(el.dataset.i));
    else if (act === 'copyblink') { const i = $('#blnk'); i.select(); try { navigator.clipboard.writeText(i.value); } catch (x) { document.execCommand('copy'); } toast('Link copiado'); }
    else if (act === 'export') Store.download('turnos-copia-' + T.dateStr(new Date()) + '.json', JSON.stringify(S, null, 1), 'application/json');
    else if (act === 'demo') { if (window.confirm('Esto reemplaza los datos actuales por datos de ejemplo. ¿Seguir?')) { seedDemo(); render(); toast('Datos de ejemplo cargados'); } }
    else if (act === 'wipe') { if (window.confirm('Se borra TODO (turnos, clientes, ajustes). ¿Seguro?')) { S = T.defaultState(); save(); brand(); render(); toast('Listo, empezás de cero'); } }
  });

  function opts(list, sel) { return list.map(o => '<option value="' + esc(o[0]) + '"' + (o[0] === sel ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join(''); }
  const svcOpts = () => S.services.filter(s => s.active !== false).map(s => [s.id, s.name + ' · ' + s.duration + ' min · ' + T.money(s.price)]);
  const barOpts = () => S.barbers.filter(b => b.active !== false && (!BARBER || b.id === BARBER)).map(b => [b.id, b.name]);

  function dlgCobrar(a) {
    openDlg('<h2>Cobrar a ' + esc(a.name) + '</h2><div class="muted small">' + esc(a.serviceName) + (a.deposit && a.deposit.paid ? ' · seña ya cobrada ' + T.money(a.deposit.amount) : '') + '</div>' +
      '<div class="field"><label>Precio final $</label><input name="price" type="number" inputmode="numeric" value="' + a.price + '" min="0"></div>' +
      '<div class="field"><label>Medio de pago</label><select name="method">' + opts(METHODS, 'efectivo') + '</select></div>' +
      '<div class="field"><label>Propina $ (opcional)</label><input name="tip" type="number" inputmode="numeric" value="0" min="0"></div>' + dlgButtons('Registrar cobro'),
      f => { refresh(); const r = T.complete(S, a.id, { price: f.price.value, method: f.method.value, tip: f.tip.value }); save(); render(); toast('Cobro registrado'); return r.ok; });
  }

  function slotOptions(date, svcId, barberId) {
    const sl = T.freeSlots(S, { date, serviceId: svcId, barberId, admin: true });
    return sl.length ? sl.map(s => '<option value="' + s.start + '">' + s.start + '</option>').join('') : '<option value="">Sin horarios libres</option>';
  }
  function dlgNuevo() {
    const f = openDlg('<h2>Nuevo turno</h2><div class="field"><label>Servicio</label><select name="svc">' + opts(svcOpts()) + '</select></div>' +
      '<div class="grid2"><div class="field"><label>Barbero</label><select name="bar">' + opts(barOpts()) + '</select></div><div class="field"><label>Día</label><input name="date" type="date" value="' + day + '"></div></div>' +
      '<div class="field"><label>Hora</label><select name="time"></select></div>' +
      '<div class="field"><label>Nombre</label><input name="name" required></div><div class="field"><label>Celular (opcional)</label><input name="phone" type="tel" inputmode="tel"></div>' +
      '<div id="derr" class="notice bad hidden"></div>' + dlgButtons('Guardar turno'),
      form => {
        refresh();
        const r = T.createAppointment(S, { admin: true, date: form.date.value, start: form.time.value, serviceId: form.svc.value, barberId: form.bar.value, name: form.name.value, phone: form.phone.value, source: 'manual' });
        if (!r.ok) { const d = $('#derr'); d.textContent = r.error; d.classList.remove('hidden'); return false; }
        save(); day = form.date.value; render(); toast('Turno guardado');
      });
    const upd = () => { f.time.innerHTML = slotOptions(f.date.value, f.svc.value, f.bar.value); };
    ['svc', 'bar', 'date'].forEach(n => f[n].addEventListener('change', upd)); upd();
  }

  function dlgWalkin() {
    openDlg('<h2>Cliente sin turno</h2><p class="muted small" style="margin:0">Se anota en el primer hueco libre de hoy del barbero elegido.</p>' +
      '<div class="field"><label>Servicio</label><select name="svc">' + opts(svcOpts()) + '</select></div>' +
      '<div class="field"><label>Barbero</label><select name="bar">' + opts(barOpts()) + '</select></div>' +
      '<div class="field"><label>Nombre (opcional)</label><input name="name"></div>' +
      '<div id="derr" class="notice bad hidden"></div>' + dlgButtons('Anotar'),
      form => {
        refresh();
        const today = T.dateStr(new Date());
        const sl = T.freeSlots(S, { date: today, serviceId: form.svc.value, barberId: form.bar.value, admin: true });
        if (!sl.length) { const d = $('#derr'); d.textContent = 'No quedan huecos libres hoy para ese barbero.'; d.classList.remove('hidden'); return false; }
        const r = T.createAppointment(S, { admin: true, date: today, start: sl[0].start, serviceId: form.svc.value, barberId: form.bar.value, name: form.name.value, source: 'walkin' });
        if (!r.ok) { const d = $('#derr'); d.textContent = r.error; d.classList.remove('hidden'); return false; }
        save(); day = today; render(); toast('Anotado a las ' + sl[0].start);
      });
  }

  function dlgBlock() {
    const f = openDlg('<h2>Bloquear horario</h2><div class="field"><label>Quién</label><select name="who"><option value="">Todo el local</option>' + opts(barOpts()) + '</select></div>' +
      '<div class="field"><label>Día</label><input name="date" type="date" value="' + day + '"></div>' +
      '<label class="row" style="margin:6px 0"><input type="checkbox" name="all" checked style="width:auto;min-height:0"> Todo el día</label>' +
      '<div class="grid2" id="hrs"><div class="field"><label>Desde</label><input name="from" type="time" value="12:00"></div><div class="field"><label>Hasta</label><input name="to" type="time" value="14:00"></div></div>' +
      '<div class="field"><label>Motivo (opcional)</label><input name="reason" placeholder="Franco, trámite, feriado…"></div><div id="derr" class="notice bad hidden"></div>' + dlgButtons('Bloquear'),
      form => {
        const all = form.all.checked, a = all ? '00:00' : form.from.value, b = all ? '24:00' : form.to.value;
        if (!form.date.value || (!all && (!a || !b || a >= b))) { const d = $('#derr'); d.textContent = 'Revisá el día y las horas.'; d.classList.remove('hidden'); return false; }
        refresh(); S.blocks.push({ id: T.uid(), barberId: form.who.value || null, date: form.date.value, start: a, end: b, reason: form.reason.value.trim() });
        const hit = S.appts.filter(x => x.date === form.date.value && T.blocksSlot(x, S, Date.now()) && (!form.who.value || x.barberId === form.who.value) && T.toMin(x.start) < T.toMin(b === '24:00' ? '23:59' : b) && T.toMin(x.start) + x.duration > T.toMin(a)).length;
        save(); day = form.date.value; render(); toast(hit ? 'Bloqueado. Ojo: hay ' + hit + ' turno(s) ya dados en ese rango' : 'Horario bloqueado');
      });
    const sync = () => { $('#hrs').classList.toggle('hidden', f.all.checked); };
    f.all.addEventListener('change', sync); sync();
  }

  function dlgRemind() {
    const tomorrow = T.addDays(T.dateStr(new Date()), 1);
    const list = S.appts.filter(a => a.date === tomorrow && a.status === 'confirmada' && a.phone).sort((a, b) => a.start.localeCompare(b.start));
    openDlg('<h2>Recordatorios de mañana</h2><p class="muted small" style="margin:0">Un toque por cliente: se abre WhatsApp con el mensaje listo. Bajan las faltas.</p>' +
      (list.length ? list.map(a => '<div class="row between"><span><b>' + a.start + '</b> ' + esc(a.name) + '</span><a class="btn sm' + (a.reminded ? '' : ' primary') + '" target="_blank" rel="noopener" data-act="wa" data-id="' + a.id + '" href="' + T.waLink(a.phone, T.reminderMsg(S, a)) + '">' + (a.reminded ? 'Reenviar' : 'Enviar') + '</a></div>').join('') : '<div class="card center muted">No hay turnos confirmados para mañana.</div>') +
      '<button type="button" class="btn block" data-close>Cerrar</button>', null);
  }

  /* ---------- Render ---------- */
  function render() {
    refresh(); brand();
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === tab));
    if (dlg.open) return;
    const y = window.scrollY;
    if (tab === 'agenda') renderAgenda(); else if (tab === 'caja') renderCaja(); else if (tab === 'clientes') renderClientes(); else renderAjustes();
    window.scrollTo(0, y);
  }
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { tab = t.dataset.tab; render(); }));
  window.addEventListener('storage', () => { if (!REMOTE && authed() && tab !== 'ajustes') render(); });
  const tick = () => { if (authed() && (tab === 'agenda' || tab === 'caja') && !dlg.open) { if (REMOTE) reload(); else render(); } };
  setInterval(tick, REMOTE ? 30000 : 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  gate();
})();
