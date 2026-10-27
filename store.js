/* Almacenamiento local del navegador (modo demo/independiente).
   Si localStorage no está disponible, funciona en memoria sin romperse. */
(function (root) {
  'use strict';
  const KEY = 'turnos.v1';
  const MY = 'turnos.mis';
  let mem = null;
  const listeners = [];

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, val) { try { localStorage.setItem(key, val); return true; } catch (e) { return false; } }

  function load() {
    const raw = read(KEY);
    if (raw) {
      try {
        const s = JSON.parse(raw);
        const d = Turnos.defaultState();
        s.settings = Object.assign(d.settings, s.settings || {});
        s.services = s.services || d.services; s.barbers = s.barbers || d.barbers;
        s.appts = s.appts || []; s.blocks = s.blocks || [];
        return s;
      } catch (e) { /* datos dañados: se arranca limpio */ }
    }
    return mem || Turnos.defaultState();
  }
  function save(state) { mem = state; write(KEY, JSON.stringify(state)); }
  function onChange(fn) {
    listeners.push(fn);
  }
  root.addEventListener('storage', e => { if (e.key === KEY) listeners.forEach(f => f()); });

  function myCodes() { try { return JSON.parse(read(MY) || '[]'); } catch (e) { return []; } }
  function addMyCode(c) { const l = myCodes().filter(x => x !== c); l.unshift(c); write(MY, JSON.stringify(l.slice(0, 5))); }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  root.Store = { load, save, onChange, myCodes, addMyCode, download };
})(window);
