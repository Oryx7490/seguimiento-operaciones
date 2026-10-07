import { jsonOk } from "@/app/lib/api";
import { logActivityAsync } from "@/app/lib/audit";
import { PRESENCE_WINDOW_MINUTES, currentUser, onlineUsers, touchPresence } from "@/app/lib/session";

/** Usuarios en línea ahora mismo. */
export async function GET() {
  const [users, me] = await Promise.all([onlineUsers(), currentUser()]);
  return jsonOk({
    online: users.length,
    window_minutes: PRESENCE_WINDOW_MINUTES,
    users: users.map((row) => ({ id: row.id, name: row.name, role: row.role })),
    me: me ? { id: me.id, name: me.name, role: me.role } : null,
  });
}

/** Latido: el cliente lo envía al abrir la app y cada 30 s. */
export async function POST() {
  const user = await currentUser();
  if (!user) return jsonOk({ online: 0, registered: false });

  const previous = await onlineUsers();
  const isNew = !previous.some((row) => row.id === user.id);
  await touchPresence(user.id);
  if (isNew) {
    await logActivityAsync({
      entity_type: "user",
      entity_id: user.id,
      entity_label: user.name,
      action: "presence",
      summary: `${user.name} entró al sistema`,
      actor_id: user.id,
    });
  }

  const users = await onlineUsers();
  return jsonOk({
    online: users.length,
    window_minutes: PRESENCE_WINDOW_MINUTES,
    users: users.map((row) => ({ id: row.id, name: row.name, role: row.role })),
    me: { id: user.id, name: user.name, role: user.role },
    registered: true,
  });
}
