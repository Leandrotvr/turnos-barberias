/* Turnos — núcleo de lógica (sin interfaz). Funciona en el navegador y en Node (para pruebas). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Turnos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const DOW_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const pad = n => String(n).padStart(2, '0');
  const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
  const fromMin = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  const dateStr = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return dateStr(d); };
  const weekday = s => parseDate(s).getDay();
  const tsOf = (date, min) => { const d = parseDate(date); d.setHours(0, min, 0, 0); return d.getTime(); };
  const dateLabel = s => { const d = parseDate(s); return DOW[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
  const money = n => '$' + Math.round(n).toLocaleString('es-AR');
  const uid = () => Math.random().toString(36).slice(2, 10);

  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  function newCode(state) {
    for (;;) {
      let c = '';
      for (let i = 0; i < 6; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      if (!state.appts.some(a => a.code === c)) return c;
    }
  }

  /* ---------- Teléfonos (Argentina) ---------- */
  function normPhone(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('54')) d = d.slice(2);
    if (d.startsWith('9') && d.length === 11) d = d.slice(1);
    d = d.replace(/^0+/, '');
    if (d.length > 10) {
      for (let a = 2; a <= 4; a++) {
        if (d.slice(a, a + 2) === '15' && d.length - 2 === 10) { d = d.slice(0, a) + d.slice(a + 2); break; }
      }
    }
    return d;
  }
  const validPhone = p => normPhone(p).length === 10;
  const waNumber = p => '549' + normPhone(p);
  const waLink = (phone, text) => 'https://wa.me/' + waNumber(phone) + (text ? '?text=' + encodeURIComponent(text) : '');

  /* ---------- Estado inicial ---------- */
  const WEEK_DEFAULT = () => ({
    0: [], 1: [['09:00', '13:00'], ['16:00', '20:00']], 2: [['09:00', '13:00'], ['16:00', '20:00']],
    3: [['09:00', '13:00'], ['16:00', '20:00']], 4: [['09:00', '13:00'], ['16:00', '20:00']],
    5: [['09:00', '13:00'], ['16:00', '20:00']], 6: [['09:00', '14:00']]
  });

  function defaultState() {
    return {
      v: 1,
      settings: {
        name: 'Tu Barbería', tagline: 'Reservá tu turno en 30 segundos', address: '', whatsapp: '', instagram: '',
        slotStep: 15, advanceDays: 21, minNoticeMin: 60, cancelHours: 2, holdMin: 30,
        depositMode: 'off', depositPct: 30, payInfo: '', pin: '1234', accent: '#c8a24a'
      },
      services: [
        { id: 'corte', name: 'Corte', duration: 30, price: 8000, active: true },
        { id: 'corte-barba', name: 'Corte + barba', duration: 45, price: 11000, active: true },
        { id: 'barba', name: 'Barba', duration: 20, price: 5000, active: true },
        { id: 'perfilado', name: 'Perfilado / cejas', duration: 15, price: 2500, active: true }
      ],
      barbers: [
        { id: 'b1', name: 'Barbero 1', commissionPct: 50, active: true, schedule: WEEK_DEFAULT() },
        { id: 'b2', name: 'Barbero 2', commissionPct: 50, active: true, schedule: WEEK_DEFAULT() }
      ],
      appts: [], blocks: []
    };
  }

  /* ---------- Disponibilidad ---------- */
  // Un turno "pendiente" (esperando seña) retiene el horario sólo mientras no venza.
  function blocksSlot(a, state, nowMs) {
    if (a.status === 'confirmada' || a.status === 'atendida') return true;
    if (a.status === 'pendiente') return a.createdAt + state.settings.holdMin * 60000 > nowMs;
    return false;
  }
  function expired(a, state, nowMs) {
    return a.status === 'pendiente' && a.createdAt + state.settings.holdMin * 60000 <= nowMs;
  }

  function barberFree(state, barberId, date, startMin, dur, nowMs, ignoreId) {
    const end = startMin + dur;
    for (const a of state.appts) {
      if (a.barberId !== barberId || a.date !== date || a.id === ignoreId) continue;
      if (!blocksSlot(a, state, nowMs)) continue;
      if (startMin < toMin(a.start) + a.duration && end > toMin(a.start)) return false;
    }
    for (const b of state.blocks) {
      if (b.date !== date || (b.barberId && b.barberId !== barberId)) continue;
      if (startMin < toMin(b.end) && end > toMin(b.start)) return false;
    }
    return true;
  }

  function barberOffers(barber, serviceId) {
    return !barber.serviceIds || !barber.serviceIds.length || barber.serviceIds.includes(serviceId);
  }

  function slotsForBarber(state, barber, date, dur, nowMs, opts) {
    const out = [];
    const step = state.settings.slotStep;
    const ranges = (barber.schedule && barber.schedule[weekday(date)]) || [];
    for (const [rs, re] of ranges) {
      for (let s = toMin(rs); s + dur <= toMin(re); s += step) {
        if (!opts.admin && tsOf(date, s) < nowMs + state.settings.minNoticeMin * 60000) continue;
        if (opts.admin && tsOf(date, s) < nowMs - 15 * 60000) continue;
        if (barberFree(state, barber.id, date, s, dur, nowMs, opts.ignoreId)) out.push(s);
      }
    }
    return out;
  }

  // Devuelve [{start:'HH:MM', barberId}] — con barberId 'any' elige al barbero con menos turnos ese día.
  function freeSlots(state, o) {
    const nowMs = o.now || Date.now();
    const svc = state.services.find(s => s.id === o.serviceId);
    if (!svc) return [];
    const today = dateStr(new Date(nowMs));
    if (o.date < today) return [];
    if (!o.admin && o.date > addDays(today, state.settings.advanceDays)) return [];
    const barbers = state.barbers.filter(b => b.active !== false && barberOffers(b, svc.id) &&
      (!o.barberId || o.barberId === 'any' || o.barberId === b.id));
    const load = {};
    barbers.forEach(b => { load[b.id] = state.appts.filter(a => a.barberId === b.id && a.date === o.date && blocksSlot(a, state, nowMs)).length; });
    const map = new Map();
    for (const b of barbers) {
      for (const s of slotsForBarber(state, b, o.date, svc.duration, nowMs, o)) {
        const cur = map.get(s);
        if (!cur || load[b.id] < load[cur]) map.set(s, b.id);
      }
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([s, barberId]) => ({ start: fromMin(s), barberId }));
  }

  /* ---------- Clientes ---------- */
  function clientStats(state, phone) {
    const n = normPhone(phone);
    if (!n) return { visits: 0, noshows: 0, spent: 0, last: null, name: '' };
    const mine = state.appts.filter(a => normPhone(a.phone) === n);
    const done = mine.filter(a => a.status === 'atendida');
    return {
      visits: done.length,
      noshows: mine.filter(a => a.status === 'noshow').length,
      spent: done.reduce((t, a) => t + (a.price || 0), 0),
      last: done.map(a => a.date).sort().pop() || null,
      name: (mine[mine.length - 1] || {}).name || ''
    };
  }

  function depositFor(state, phone, price) {
    const m = state.settings.depositMode;
    if (m === 'off') return 0;
    if (m === 'repeat' && clientStats(state, phone).noshows < 1) return 0;
    return Math.round(price * state.settings.depositPct / 100);
  }

  /* ---------- Crear / cancelar / reprogramar ---------- */
  function createAppointment(state, o) {
    const nowMs = o.now || Date.now();
    const svc = state.services.find(s => s.id === o.serviceId && s.active !== false);
    if (!svc) return { ok: false, error: 'Servicio inexistente.' };
    if (!o.admin && !String(o.name || '').trim()) return { ok: false, error: 'Falta el nombre.' };
    if ((!o.admin || o.phone) && !validPhone(o.phone)) return { ok: false, error: 'Revisá el teléfono (código de área + número, sin 0 ni 15).' };

    let barberId = o.barberId;
    if (o.admin) {
      if (!barberId || barberId === 'any') return { ok: false, error: 'Elegí un barbero.' };
      if (!barberFree(state, barberId, o.date, toMin(o.start), svc.duration, nowMs)) return { ok: false, error: 'Ese horario se superpone con otro turno o bloqueo.' };
    } else {
      const slots = freeSlots(state, { date: o.date, serviceId: svc.id, barberId: barberId || 'any', now: nowMs });
      const slot = slots.find(s => s.start === o.start);
      if (!slot) return { ok: false, error: 'Ese horario se acaba de ocupar. Elegí otro, por favor.', taken: true };
      if (!barberId || barberId === 'any') barberId = slot.barberId;
    }
    const dep = o.admin ? 0 : depositFor(state, o.phone, svc.price);
    const appt = {
      id: uid(), code: newCode(state), date: o.date, start: o.start, duration: svc.duration,
      serviceId: svc.id, serviceName: svc.name, price: svc.price, barberId,
      name: String(o.name || '').trim() || 'Cliente sin turno', phone: normPhone(o.phone), notes: (o.notes || '').trim(),
      source: o.source || (o.admin ? 'manual' : 'online'),
      status: dep ? 'pendiente' : 'confirmada', createdAt: nowMs,
      deposit: dep ? { amount: dep, paid: false } : null
    };
    state.appts.push(appt);
    return { ok: true, appt };
  }

  const findByCode = (state, code) => state.appts.find(a => a.code === String(code || '').trim().toUpperCase());
  function hoursUntil(a, nowMs) { return (tsOf(a.date, toMin(a.start)) - nowMs) / 3600000; }

  function cancelByCode(state, code, nowMs) {
    nowMs = nowMs || Date.now();
    const a = findByCode(state, code);
    if (!a || !(a.status === 'confirmada' || a.status === 'pendiente')) return { ok: false, error: 'No encontramos un turno activo con ese código.' };
    if (hoursUntil(a, nowMs) < state.settings.cancelHours) return { ok: false, late: true, error: 'Falta poco para el turno: avisale al local por WhatsApp.' };
    a.status = 'cancelada'; a.cancelledAt = nowMs;
    return { ok: true, appt: a };
  }

  function reschedule(state, code, o, nowMs) {
    nowMs = nowMs || Date.now();
    const a = findByCode(state, code);
    if (!a || !(a.status === 'confirmada' || a.status === 'pendiente')) return { ok: false, error: 'No encontramos un turno activo con ese código.' };
    if (hoursUntil(a, nowMs) < state.settings.cancelHours) return { ok: false, late: true, error: 'Falta poco para el turno: avisale al local por WhatsApp.' };
    const slots = freeSlots(state, { date: o.date, serviceId: a.serviceId, barberId: o.barberId || 'any', now: nowMs, ignoreId: a.id });
    const slot = slots.find(s => s.start === o.start);
    if (!slot) return { ok: false, error: 'Ese horario se acaba de ocupar. Elegí otro.', taken: true };
    a.date = o.date; a.start = o.start; a.barberId = (o.barberId && o.barberId !== 'any') ? o.barberId : slot.barberId;
    a.reminded = false;
    return { ok: true, appt: a };
  }

  /* ---------- Acciones del local ---------- */
  function complete(state, id, o) {
    const a = state.appts.find(x => x.id === id);
    if (!a) return { ok: false };
    a.status = 'atendida';
    if (o.price != null && !isNaN(o.price)) a.price = Number(o.price);
    a.payment = { method: o.method || 'efectivo', tip: Number(o.tip) || 0 };
    return { ok: true, appt: a };
  }
  function setStatus(state, id, status) {
    const a = state.appts.find(x => x.id === id);
    if (!a) return { ok: false };
    a.status = status;
    return { ok: true, appt: a };
  }
  function confirmDeposit(state, id) {
    const a = state.appts.find(x => x.id === id);
    if (!a || !a.deposit) return { ok: false };
    a.deposit.paid = true; a.status = 'confirmada';
    return { ok: true, appt: a };
  }

  /* ---------- Caja y reportes ---------- */
  function dayReport(state, date) {
    const r = { date, done: 0, total: 0, tips: 0, byMethod: {}, byBarber: {}, noshows: 0, cancelled: 0, lostNoShow: 0, pending: 0, expected: 0 };
    state.barbers.forEach(b => { r.byBarber[b.id] = { name: b.name, count: 0, revenue: 0, commission: 0, tips: 0 }; });
    for (const a of state.appts) {
      if (a.date !== date) continue;
      if (a.status === 'atendida') {
        r.done++; r.total += a.price; r.tips += (a.payment && a.payment.tip) || 0;
        const dep = a.deposit && a.deposit.paid ? a.deposit.amount : 0;
        const method = (a.payment && a.payment.method) || 'efectivo';
        r.byMethod[method] = (r.byMethod[method] || 0) + (a.price - dep);
        if (dep) r.byMethod['seña'] = (r.byMethod['seña'] || 0) + dep;
        const b = r.byBarber[a.barberId] || (r.byBarber[a.barberId] = { name: '(eliminado)', count: 0, revenue: 0, commission: 0, tips: 0 });
        const bb = state.barbers.find(x => x.id === a.barberId);
        b.count++; b.revenue += a.price; b.tips += (a.payment && a.payment.tip) || 0;
        b.commission += a.price * ((bb ? bb.commissionPct : 0) / 100);
      } else if (a.status === 'noshow') { r.noshows++; r.lostNoShow += a.price; }
      else if (a.status === 'cancelada') r.cancelled++;
      else if (a.status === 'confirmada') { r.expected += a.price; }
      else if (a.status === 'pendiente') r.pending++;
    }
    return r;
  }

  /* ---------- Mensajes e ICS ---------- */
  const barberName = (state, id) => (state.barbers.find(b => b.id === id) || { name: '' }).name;
  function confirmMsg(state, a) {
    let t = `Hola ${a.name}! Tu turno en ${state.settings.name} quedó ${a.status === 'pendiente' ? 'reservado (falta la seña)' : 'confirmado'}: ${a.serviceName} con ${barberName(state, a.barberId)}, ${dateLabel(a.date)} a las ${a.start}. Código: ${a.code}.`;
    if (a.status === 'pendiente' && a.deposit) t += ` Seña: ${money(a.deposit.amount)}. ${state.settings.payInfo || ''}`;
    return t.trim();
  }
  function reminderMsg(state, a) {
    return `Hola ${a.name}! Te recordamos tu turno en ${state.settings.name}: ${dateLabel(a.date)} a las ${a.start} (${a.serviceName}). Si no podés venir, avisanos o cancelalo con tu código ${a.code}. ¡Te esperamos!`;
  }
  function icsFor(state, a) {
    const ymd = a.date.replace(/-/g, '');
    const hm = m => pad(Math.floor(m / 60)) + pad(m % 60) + '00';
    const s = toMin(a.start);
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Turnos//ES', 'BEGIN:VEVENT', 'UID:' + a.id + '@turnos',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      `DTSTART:${ymd}T${hm(s)}`, `DTEND:${ymd}T${hm(s + a.duration)}`,
      `SUMMARY:${a.serviceName} - ${state.settings.name}`, `LOCATION:${state.settings.address || ''}`,
      `DESCRIPTION:Código ${a.code}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  /* ---------- Horarios como texto ---------- */
  function parseRanges(txt) {
    const out = [];
    for (const part of String(txt || '').split(/[,;]/).map(s => s.trim()).filter(Boolean)) {
      const m = part.match(/^(\d{1,2}):?(\d{2})?\s*-\s*(\d{1,2}):?(\d{2})?$/);
      if (!m) return null;
      const a = Number(m[1]) * 60 + Number(m[2] || 0), b = Number(m[3]) * 60 + Number(m[4] || 0);
      if (a >= b || b > 24 * 60) return null;
      out.push([fromMin(a), fromMin(b)]);
    }
    return out;
  }
  const rangesToText = r => (r || []).map(x => x[0] + '-' + x[1]).join(', ');

  return {
    DOW, DOW_SHORT, pad, toMin, fromMin, dateStr, parseDate, addDays, weekday, tsOf, dateLabel, money, uid,
    normPhone, validPhone, waNumber, waLink, defaultState, freeSlots, barberFree, clientStats, depositFor,
    createAppointment, findByCode, cancelByCode, reschedule, complete, setStatus, confirmDeposit,
    dayReport, confirmMsg, reminderMsg, icsFor, parseRanges, rangesToText, blocksSlot, expired, hoursUntil, barberName
  };
});
