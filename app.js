/* Página de reservas para clientes */
(function () {
  'use strict';
  const T = Turnos;
  let S = T.defaultState();
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const view = $('#view');

  let step = 1;
  let sel = { serviceId: null, barberId: 'any', pickedBarber: null, date: null, start: null, resched: null };
  let done = null; // turno recién creado
  let fatal = null;

  const svc = () => S.services.find(s => s.id === sel.serviceId);
  const activeBarbers = () => S.barbers.filter(b => b.active !== false && (!b.serviceIds || !b.serviceIds.length || b.serviceIds.includes(sel.serviceId)));
  const ignoreId = () => (sel.resched ? sel.resched.id : undefined);

  async function reload() {
    try { S = await Data.loadPublic(); fatal = null; }
    catch (e) { fatal = e.message === 'shop' ? 'shop' : 'net'; }
    render();
  }

  function applyBrand() {
    const st = S.settings;
    const root = document.documentElement.style;
    root.setProperty('--accent', st.accent || '#c8a24a');
    const h = (st.accent || '#c8a24a').replace('#', '');
    const r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    root.setProperty('--accent-ink', (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#1a1405' : '#ffffff');
    $('#brand').textContent = st.name;
    $('#tag').textContent = st.tagline || '';
    document.title = 'Reservar turno · ' + st.name;
    const meta = [];
    if (st.address) meta.push('📍 ' + esc(st.address));
    if (st.instagram) meta.push('<a href="https://instagram.com/' + esc(st.instagram.replace('@', '')) + '" rel="noopener">@' + esc(st.instagram.replace('@', '')) + '</a>');
    if (T.validPhone(st.whatsapp)) meta.push('<a href="' + T.waLink(st.whatsapp) + '" rel="noopener">WhatsApp</a>');
    $('#meta').innerHTML = meta.map(m => '<span>' + m + '</span>').join('');
  }

  function stepsBar(n, total) {
    $('#steps').innerHTML = Array.from({ length: total }, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('');
  }

  /* ---------- Pasos ---------- */
  function renderServices() {
    stepsBar(1, 4);
    const list = S.services.filter(s => s.active !== false);
    view.innerHTML = '<h2>¿Qué te hacés?</h2><div class="stack">' + (list.length ? list.map(s =>
      '<button class="card click row between" data-act="service" data-id="' + esc(s.id) + '"><span><b>' + esc(s.name) + '</b><br><span class="muted small">' + s.duration + ' min</span></span><span class="price">' + T.money(s.price) + '</span></button>'
    ).join('') : '<p class="muted">El local todavía no cargó servicios.</p>') + '</div>';
  }

  function renderBarbers() {
    stepsBar(2, 4);
    const bs = activeBarbers();
    view.innerHTML = '<button class="btn ghost sm" data-act="back">← Volver</button><h2 style="margin-top:12px">¿Con quién?</h2><div class="stack">' +
      '<button class="card click row" data-act="barber" data-id="any"><span class="avatar">★</span><span><b>El primero disponible</b><br><span class="muted small">Te damos más horarios para elegir</span></span></button>' +
      bs.map(b => '<button class="card click row" data-act="barber" data-id="' + esc(b.id) + '"><span class="avatar">' + esc(b.name.charAt(0).toUpperCase()) + '</span><b>' + esc(b.name) + '</b></button>').join('') + '</div>';
  }

  function slotsOn(date) { return T.freeSlots(S, { date, serviceId: sel.serviceId, barberId: sel.barberId, ignoreId: ignoreId() }); }
  function daysList() {
    const today = T.dateStr(new Date());
    const out = [];
    for (let i = 0; i <= S.settings.advanceDays; i++) { const d = T.addDays(today, i); out.push({ d, n: slotsOn(d).length }); }
    return out;
  }

  function renderTimes() {
    stepsBar(3, 4);
    const days = daysList();
    if (!sel.date || !days.find(x => x.d === sel.date && x.n)) {
      const first = days.find(x => x.n); sel.date = first ? first.d : null;
    }
    const slots = sel.date ? slotsOn(sel.date) : [];
    const am = slots.filter(s => T.toMin(s.start) < 13 * 60), pm = slots.filter(s => T.toMin(s.start) >= 13 * 60);
    const chips = l => '<div class="chips">' + l.map(s => '<button class="chip' + (sel.start === s.start ? ' sel' : '') + '" data-act="time" data-t="' + s.start + '" data-b="' + esc(s.barberId) + '">' + s.start + '</button>').join('') + '</div>';
    const sv = svc();
    view.innerHTML = '<button class="btn ghost sm" data-act="back">← Volver</button>' +
      '<h2 style="margin-top:12px">' + (sel.resched ? 'Elegí el nuevo horario' : 'Elegí día y hora') + '</h2>' +
      '<p class="muted small" style="margin-top:-6px">' + esc(sv.name) + ' · ' + sv.duration + ' min · ' + T.money(sv.price) + '</p>' +
      (days.some(x => x.n) ? '<div class="days" role="tablist">' + days.map(x => {
        const d = T.parseDate(x.d);
        return '<button class="day' + (x.d === sel.date ? ' sel' : '') + '" data-act="date" data-d="' + x.d + '"' + (x.n ? '' : ' disabled') + '><span>' + T.DOW_SHORT[d.getDay()] + '</span><b>' + d.getDate() + '</b><span>' + (d.getMonth() + 1) + '</span></button>';
      }).join('') + '</div>' +
        (am.length ? '<h3>Mañana</h3>' + chips(am) : '') + (pm.length ? '<h3 style="margin-top:14px">Tarde / noche</h3>' + chips(pm) : '')
        : '<div class="notice">No hay horarios libres en los próximos días. Escribinos por WhatsApp y lo resolvemos.</div>');
  }

  function renderForm() {
    stepsBar(4, 4);
    const sv = svc(), barberId = sel.barberId === 'any' ? sel.pickedBarber : sel.barberId, bname = T.barberName(S, barberId);
    const dep = S.settings.depositMode === 'always' ? Math.round(sv.price * S.settings.depositPct / 100) : 0;
    const last = (() => { try { return JSON.parse(localStorage.getItem('turnos.yo') || '{}'); } catch (e) { return {}; } })();
    view.innerHTML = '<button class="btn ghost sm" data-act="back">← Volver</button><h2 style="margin-top:12px">Tus datos</h2>' +
      '<div class="card"><b>' + esc(sv.name) + '</b> · ' + T.money(sv.price) + '<br><span class="muted">' + T.dateLabel(sel.date) + ' a las ' + sel.start + (bname ? ' · ' + esc(bname) : '') + '</span></div>' +
      '<form id="f" class="stack" style="margin-top:14px" novalidate>' +
      '<div class="field"><label for="n">Tu nombre</label><input id="n" autocomplete="name" required value="' + esc(last.name || '') + '"></div>' +
      '<div class="field"><label for="p">WhatsApp / celular (con código de área, sin 0 ni 15)</label><input id="p" type="tel" inputmode="tel" autocomplete="tel" placeholder="3794 123456" required value="' + esc(last.phone || '') + '"></div>' +
      (Data.remote ? '<div class="field"><label for="m">Email (opcional: te mandamos la confirmación y el recordatorio)</label><input id="m" type="email" autocomplete="email" value="' + esc(last.email || '') + '"></div>' : '') +
      '<div class="field"><label for="o">Aclaración (opcional)</label><input id="o" placeholder="Ej: degradé bajo"></div>' +
      (dep ? '<div class="notice">Para confirmar el turno se pide una seña de <b>' + T.money(dep) + '</b>. Te mostramos cómo pagarla en el próximo paso y el horario queda reservado ' + S.settings.holdMin + ' minutos.</div>' : '') +
      '<div id="err" class="notice bad hidden" role="alert"></div>' +
      '<button class="btn primary block" type="submit">' + (sel.resched ? 'Confirmar el cambio' : 'Confirmar turno') + '</button>' +
      '<p class="muted small center" style="margin:0">Cancelar o cambiar es gratis hasta ' + S.settings.cancelHours + ' hs antes.</p></form>';
  }

  function renderDone() {
    stepsBar(4, 4);
    const a = done, pend = a.status === 'pendiente', st = S.settings;
    const msgShop = 'Hola! Reservé turno (código ' + a.code + ') para el ' + T.dateLabel(a.date) + ' a las ' + a.start + '. Nombre: ' + a.name + '.' + (pend ? ' Ya hice la seña.' : '');
    view.innerHTML = '<div class="card stack center"><div style="font-size:2rem">' + (pend ? '⏳' : '✅') + '</div>' +
      '<h2>' + (pend ? 'Reservado, falta la seña' : '¡Turno confirmado!') + '</h2>' +
      '<p style="margin:0"><b>' + esc(a.serviceName) + '</b> con ' + esc(T.barberName(S, a.barberId)) + '<br>' + T.dateLabel(a.date) + ' · ' + a.start + ' hs</p>' +
      '<div class="big-code" aria-label="Código del turno">' + a.code + '</div>' +
      '<p class="muted small" style="margin:0">Guardá este código: sirve para cancelar o cambiar el turno. Queda guardado en este celular.</p></div>' +
      (pend ? '<div class="notice" style="margin-top:12px">Seña a pagar: <b>' + T.money(a.deposit.amount) + '</b>. ' + esc(st.payInfo || 'Consultá al local cómo abonarla.') +
        '<br>El horario se mantiene ' + st.holdMin + ' minutos desde ahora. Si no se confirma la seña, se libera.</div>' : '') +
      '<div class="stack" style="margin-top:14px">' +
      (T.validPhone(st.whatsapp) ? '<a class="btn primary block" href="' + T.waLink(st.whatsapp, msgShop) + '" rel="noopener">' + (pend ? 'Avisar que ya pagué la seña' : 'Avisar al local por WhatsApp') + '</a>' : '') +
      '<button class="btn block" data-act="ics">Agregar al calendario</button>' +
      '<button class="btn ghost block" data-act="again">Reservar otro turno</button></div>';
  }

  function renderFatal() {
    stepsBar(0, 4);
    view.innerHTML = fatal === 'shop'
      ? '<div class="notice bad">Este link de reservas no es válido. Pedile al local que te lo vuelva a pasar.</div>'
      : '<div class="notice bad">No pudimos cargar los horarios. Revisá tu conexión.</div><button class="btn block" style="margin-top:12px" data-act="retry">Reintentar</button>';
  }

  function render() {
    applyBrand();
    if (fatal) return renderFatal();
    if (done) return renderDone();
    if (step === 1) return renderServices();
    if (step === 2) return renderBarbers();
    if (step === 3) return renderTimes();
    return renderForm();
  }

  /* ---------- Mis turnos ---------- */
  async function renderMine() {
    const box = $('#mine');
    if (done || fatal) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    const now = Date.now();
    const found = await Promise.all(Store.myCodes().map(c => Data.lookup(c)));
    const list = found.filter(a => a && (a.status === 'confirmada' || a.status === 'pendiente') && T.tsOf(a.date, T.toMin(a.start)) > now - 3600000);
    if (!list.length) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = '<h3>Tu próximo turno</h3>' + list.map(apptCard).join('');
  }
  function apptCard(a) {
    return '<div class="card stack"><div class="row between"><b>' + esc(a.serviceName) + '</b><span class="badge ' + (a.status === 'pendiente' ? 'warn' : 'ok') + '">' + (a.status === 'pendiente' ? 'Falta seña' : 'Confirmado') + '</span></div>' +
      '<div>' + T.dateLabel(a.date) + ' · ' + a.start + ' hs · ' + esc(T.barberName(S, a.barberId)) + '<br><span class="muted small">Código ' + esc(a.code) + '</span></div>' +
      '<div class="row"><button class="btn sm grow" data-act="resched" data-code="' + esc(a.code) + '">Cambiar horario</button><button class="btn sm danger grow" data-act="cancel" data-code="' + esc(a.code) + '">Cancelar</button></div></div>';
  }

  /* ---------- Navegación ---------- */
  async function go(n) {
    step = n;
    if (n === 3) { view.innerHTML = '<p class="muted center">Buscando horarios libres…</p>'; await reload(); } else render();
    window.scrollTo(0, 0);
  }

  /* ---------- Eventos ---------- */
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act;
    if (act === 'service') {
      sel.serviceId = el.dataset.id; sel.start = null; sel.date = null;
      const bs = activeBarbers();
      if (bs.length <= 1) { sel.barberId = bs[0] ? bs[0].id : 'any'; go(3); } else go(2);
    } else if (act === 'barber') { sel.barberId = el.dataset.id; sel.start = null; sel.date = null; go(3); }
    else if (act === 'date') { sel.date = el.dataset.d; sel.start = null; renderTimes(); }
    else if (act === 'time') {
      sel.start = el.dataset.t; sel.pickedBarber = el.dataset.b;
      if (sel.resched) return doReschedule();
      go(4);
    }
    else if (act === 'back') {
      if (step === 4) go(3); else if (step === 3) { if (sel.resched) { sel.resched = null; go(1); } else go(activeBarbers().length <= 1 ? 1 : 2); } else go(1);
    }
    else if (act === 'retry') reload().then(renderMine);
    else if (act === 'again') { done = null; sel = { serviceId: null, barberId: 'any', pickedBarber: null, date: null, start: null, resched: null }; step = 1; await reload(); renderMine(); window.scrollTo(0, 0); }
    else if (act === 'ics' && done) Store.download('turno-' + done.code + '.ics', T.icsFor(S, done), 'text/calendar');
    else if (act === 'cancel') doCancel(el.dataset.code);
    else if (act === 'resched') startResched(el.dataset.code);
  });

  document.addEventListener('submit', async e => {
    if (e.target.id !== 'f') return;
    e.preventDefault();
    const err = $('#err'), btn = e.target.querySelector('button[type=submit]');
    const name = $('#n').value, phone = $('#p').value, email = $('#m') ? $('#m').value.trim() : '';
    if (!name.trim()) { err.textContent = 'Falta el nombre.'; err.classList.remove('hidden'); return; }
    if (!T.validPhone(phone)) { err.textContent = 'Revisá el teléfono (código de área + número, sin 0 ni 15).'; err.classList.remove('hidden'); return; }
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = 'Revisá el email.'; err.classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Reservando…'; err.classList.add('hidden');
    const barberId = sel.barberId === 'any' ? sel.pickedBarber : sel.barberId;
    const r = await Data.book({ date: sel.date, start: sel.start, serviceId: sel.serviceId, barberId, name, phone, email, notes: $('#o').value });
    if (!r.ok) {
      err.textContent = r.error; err.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Confirmar turno';
      if (r.taken) { sel.start = null; setTimeout(() => go(3), 1400); }
      return;
    }
    Store.addMyCode(r.appt.code);
    try { localStorage.setItem('turnos.yo', JSON.stringify({ name: r.appt.name, phone: r.appt.phone, email })); } catch (x) { /* ok */ }
    done = r.appt; render(); renderMine(); window.scrollTo(0, 0);
  });

  async function doCancel(code) {
    if (!window.confirm('¿Cancelar este turno?')) return;
    const r = await Data.cancel(code);
    if (!r.ok) { window.alert(r.error); return; }
    await reload(); renderMine();
    $('#lookupOut').innerHTML = '<div class="notice">Turno cancelado. ¡Gracias por avisar!</div>';
  }
  async function startResched(code) {
    const a = await Data.lookup(code); if (!a) return;
    if (T.hoursUntil(a, Date.now()) < S.settings.cancelHours) { window.alert(Data.msg('late')); return; }
    sel = { serviceId: a.serviceId, barberId: 'any', pickedBarber: null, date: null, start: null, resched: a };
    done = null; go(3);
  }
  async function doReschedule() {
    const r = await Data.resched(sel.resched.code, { date: sel.date, start: sel.start, barberId: sel.pickedBarber });
    if (!r.ok) { window.alert(r.error); sel.start = null; await reload(); return; }
    Store.addMyCode(r.appt.code);
    sel.resched = null; done = r.appt; await reload(); renderMine(); window.scrollTo(0, 0);
  }

  $('#lookupBtn').addEventListener('click', async () => {
    const a = await Data.lookup($('#lookup').value.trim());
    const out = $('#lookupOut');
    if (!a || !(a.status === 'confirmada' || a.status === 'pendiente')) { out.innerHTML = '<div class="notice bad">No encontramos un turno activo con ese código.</div>'; return; }
    out.innerHTML = apptCard(a);
  });
  $('#lookup').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase(); });
  $('#adminLink').href = 'admin.html' + location.search;

  window.addEventListener('storage', () => { if (!Data.remote && !done) reload().then(renderMine); });
  view.innerHTML = '<p class="muted center">Cargando…</p>';
  reload().then(renderMine);
})();
