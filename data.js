/* Capa de datos: modo "en línea" (Supabase, con ?s=local) o modo demostración local (navegador). */
(function (root) {
  'use strict';
  const T = Turnos;
  const cfg = root.TURNOS_CONFIG || {};
  const slug = (new URLSearchParams(location.search).get('s') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const remote = !!(slug && cfg.supabaseUrl && cfg.supabaseKey);

  async function rpc(name, args) {
    let r;
    try {
      r = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/' + name, {
        method: 'POST', headers: { apikey: cfg.supabaseKey, 'Content-Type': 'application/json' }, body: JSON.stringify(args)
      });
    } catch (e) { throw new Error('offline'); }
    if (!r.ok) {
      let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* sin cuerpo */ }
      throw new Error(m || ('http ' + r.status));
    }
    return r.json();
  }

  const MSG = {
    taken: 'Ese horario se acaba de ocupar. Elegí otro, por favor.', hours: 'Ese horario ya no está disponible. Elegí otro.',
    notice: 'Ese horario ya no está disponible. Elegí otro.', range: 'Ese día no está disponible. Elegí otro.', blocked: 'Ese horario ya no está disponible. Elegí otro.',
    phone: 'Revisá el teléfono (código de área + número, sin 0 ni 15).', name: 'Falta el nombre.',
    limit: 'Ya tenés 3 turnos activos en este local. Cancelá uno para reservar otro.',
    late: 'Falta poco para el turno: avisale al local por WhatsApp.', notfound: 'No encontramos un turno activo con ese código.',
    offline: 'No hay conexión. Probá de nuevo en un momento.', auth: 'La clave no es correcta.'
  };
  const TAKEN = new Set(['taken', 'hours', 'notice', 'range', 'blocked']);
  const fail = code => ({ ok: false, error: MSG[code] || 'Hubo un problema. Recargá la página e intentá de nuevo.', taken: TAKEN.has(code), late: code === 'late', code });
  const guard = async fn => { try { return await fn(); } catch (e) { return fail(String(e.message || '').includes('auth') ? 'auth' : (e.message === 'offline' ? 'offline' : 'error')); } };

  function baseState(c) {
    const d = T.defaultState(); c = c || {};
    return {
      v: 1, settings: Object.assign(d.settings, c.settings || {}),
      services: (c.services && c.services.length) ? c.services : d.services,
      barbers: (c.barbers && c.barbers.length) ? c.barbers : d.barbers,
      blocks: c.blocks || [], appts: []
    };
  }

  const Data = {
    remote, slug,

    /* ---- Cliente ---- */
    async loadPublic() {
      if (!remote) return Store.load();
      const pub = await rpc('bb_public', { p_slug: slug });
      if (!pub) { const e = new Error('shop'); throw e; }
      const s = baseState(pub.config);
      s.appts = (pub.busy || []).map(b => Object.assign({ serviceId: '' }, b));
      return s;
    },
    book(o) {
      if (!remote) {
        const S = Store.load();
        const r = T.createAppointment(S, o);
        if (r.ok) Store.save(S);
        return Promise.resolve(r);
      }
      return guard(async () => {
        const r = await rpc('bb_book', { p_slug: slug, p_date: o.date, p_start: o.start, p_service: o.serviceId, p_barber: o.barberId,
          p_name: o.name, p_phone: T.normPhone(o.phone), p_notes: o.notes || '', p_email: o.email || '' });
        return r.ok ? r : fail(r.error);
      });
    },
    lookup(code) {
      if (!remote) return Promise.resolve(T.findByCode(Store.load(), code) || null);
      return rpc('bb_lookup', { p_slug: slug, p_code: code }).catch(() => null);
    },
    cancel(code) {
      if (!remote) { const S = Store.load(); const r = T.cancelByCode(S, code); if (r.ok) Store.save(S); return Promise.resolve(r); }
      return guard(async () => { const r = await rpc('bb_cancel', { p_slug: slug, p_code: code }); return r.ok ? r : fail(r.error); });
    },
    resched(code, o) {
      if (!remote) { const S = Store.load(); const r = T.reschedule(S, code, o); if (r.ok) Store.save(S); return Promise.resolve(r); }
      return guard(async () => {
        const r = await rpc('bb_resched', { p_slug: slug, p_code: code, p_date: o.date, p_start: o.start, p_barber: o.barberId });
        return r.ok ? r : fail(r.error);
      });
    },

    /* ---- Local (panel) ---- */
    async adminLoad(key) {
      if (!remote) return { state: Store.load(), notify: null };
      const r = await rpc('bb_admin_get', { p_slug: slug, p_key: key, p_from: T.addDays(T.dateStr(new Date()), -120) });
      const s = baseState(r.config); s.appts = r.appts || [];
      return { state: s, notify: r.notify || {}, configured: !!(r.config && r.config.services && r.config.barbers) };
    },
    adminSaveConfig(key, c) { return guard(async () => rpc('bb_admin_save_config', { p_slug: slug, p_key: key, p_config: c })); },
    adminPutAppt(key, a, isNew) {
      return guard(async () => { const r = await rpc('bb_admin_put_appt', { p_slug: slug, p_key: key, p_appt: a, p_is_new: !!isNew }); return r.ok ? r : fail(r.error); });
    },
    setNotify(key, o) {
      return guard(async () => rpc('bb_admin_set_notify', { p_slug: slug, p_key: key, p_tg_token: o.token, p_tg_chat: o.chat, p_resend: o.resend, p_from: o.from }));
    },
    testNotify(key) { return guard(async () => rpc('bb_admin_test_notify', { p_slug: slug, p_key: key })); },

    /* ---- Barbero (link propio: sólo ve y maneja su agenda) ---- */
    async barberLoad(bkey) {
      const r = await rpc('bb_barber_get', { p_slug: slug, p_bkey: bkey, p_from: T.addDays(T.dateStr(new Date()), -120) });
      const s = baseState(r.config); s.appts = r.appts || [];
      return { state: s, notify: null, configured: true, barberId: r.barberId };
    },
    barberPut(bkey, a, isNew) {
      return guard(async () => { const r = await rpc('bb_barber_put_appt', { p_slug: slug, p_bkey: bkey, p_appt: a, p_is_new: !!isNew }); return r.ok ? r : fail(r.error); });
    },
    barberInfo(bkey, info) { return guard(async () => rpc('bb_barber_save_info', { p_slug: slug, p_bkey: bkey, p_info: info })); },
    barberKey(key, barberId) { return guard(async () => rpc('bb_admin_barber_key', { p_slug: slug, p_key: key, p_barber: barberId })); },
    msg: code => MSG[code] || MSG.offline
  };
  root.Data = Data;
})(window);
