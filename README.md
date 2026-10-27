# Turnos para barberías y locales

Gestor de turnos online: página de reservas para clientes + panel del local. Sin app que descargar, sin comisiones por reserva.

## Qué incluye
**Cliente (index.html)**: reserva en 4 toques (servicio → barbero → día y hora → datos), sólo se ven horarios realmente libres, código para cancelar o cambiar sin cuenta, "agregar al calendario", aviso al local por WhatsApp, seña opcional.

**Local (admin.html)**: agenda por día y barbero, cobro con medio de pago y propina, "No vino", cliente sin turno, bloqueos de horario y días libres, caja diaria con comisión por barbero, historial de clientes con faltas, copia de seguridad y CSV de cobros, instalable como app (PWA).

**Avisos automáticos**: Telegram al dueño por cada turno nuevo/cancelado/cambiado + resumen de mañana a las 20:00 con links de WhatsApp listos; mail de confirmación y recordatorio al cliente (Resend).

## Dos modos
- **Demostración local** (sin ?s=): todo queda en el navegador. PIN de fábrica 1234. Ideal para mostrar. En Ajustes → Tus datos → "Cargar datos de ejemplo".
- **En línea** (index.html?s=LOCAL y admin.html?s=LOCAL): base compartida en Supabase. El cliente reserva desde su celular y el local lo ve en el suyo. El panel pide la clave del local (la tiene sólo su dueño).

## Dar de alta un local nuevo
En el editor SQL de Supabase: select bb_new_shop('mi-barberia', 'Mi Barbería'); — devuelve la clave del local **una sola vez** (se guarda cifrada). Después:
- Clientes: .../index.html?s=mi-barberia
- Panel: .../admin.html?s=mi-barberia#k=CLAVE (la primera vez; queda recordada en ese dispositivo).

## Seguridad
Las tablas no se pueden leer directo (RLS sin políticas). Todo pasa por funciones bb_* que validan horarios, superposición, límites por teléfono, seña y clave del local. La clave pública de config.js es pública por diseño.
