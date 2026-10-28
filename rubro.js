/* Textos según el rubro: en "salud" (consultorios) se dice profesional/paciente/consultorio en lugar de barbero/cliente/barbería. */
(function (root) {
  'use strict';
  var MAP = [
    [/Barberos/g, 'Profesionales'], [/barberos/g, 'profesionales'], [/Barbero/g, 'Profesional'], [/barbero/g, 'profesional'],
    [/Barbería/g, 'Consultorio'], [/barbería/g, 'consultorio'],
    [/Clientes/g, 'Pacientes'], [/clientes/g, 'pacientes'], [/Cliente/g, 'Paciente'], [/cliente/g, 'paciente'],
    [/Cortes/g, 'Atendidos'], [/¿Qué te hacés\?/g, '¿Qué necesitás?']
  ];
  function fix(s) { for (var i = 0; i < MAP.length; i++) s = s.replace(MAP[i][0], MAP[i][1]); return s; }
  function run() {
    if (root.__RUBRO !== 'salud' || !document.body) return;
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var p = n.parentNode && n.parentNode.nodeName;
      if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') continue;
      var t = fix(n.nodeValue); if (t !== n.nodeValue) n.nodeValue = t;
    }
    var ph = document.querySelectorAll('[placeholder]');
    for (var j = 0; j < ph.length; j++) { var v = ph[j].getAttribute('placeholder').replace('degradé bajo', 'es mi primera consulta'); if (v !== ph[j].getAttribute('placeholder')) ph[j].setAttribute('placeholder', v); }
    var d = fix(document.title); if (d !== document.title) document.title = d;
  }
  new MutationObserver(run).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  root.Rubro = { run: run };
})(window);
