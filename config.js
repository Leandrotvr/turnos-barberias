/* Conexión a la base compartida (Supabase). La clave "publishable" es pública por diseño:
   las tablas no se pueden leer directo, todo pasa por funciones con reglas (ver supabase/schema.sql).
   Un local se abre con  index.html?s=<nombre-del-local>  ; sin "?s=" la app funciona en modo demostración local. */
window.TURNOS_CONFIG = {
  supabaseUrl: 'https://hodjmhsqcbmyyjdkxmxp.supabase.co',
  supabaseKey: 'sb_publishable_XN9f3BDQe3sUNnh3PYglZA_my11T3_M'
};
