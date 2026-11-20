import { and, eq, inArray, ne } from 'drizzle-orm';
import type { NotifySettings } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { users } from '../../db/schema';
import { getSetting, setSetting } from '../settings/store';

const SUBTASK_DONE = 'notify.subtaskDone';

/** Настройки уведомлений; по умолчанию всё включено */
export async function getNotifySettings(db: Db): Promise<NotifySettings> {
  const value = await getSetting(db, SUBTASK_DONE);
  return { subtaskDone: value === undefined ? true : value === 'true' };
}

export async function saveNotifySettings(db: Db, input: NotifySettings): Promise<NotifySettings> {
  await setSetting(db, SUBTASK_DONE, String(input.subtaskDone));
  return getNotifySettings(db);
}

/** Кому слать «подзадача выполнена»: активные админы, кроме отметившего; пусто, если уведомление выключено */
export async function subtaskDoneRecipients(db: Db, exceptUserId: number): Promise<number[]> {
  if (!(await getNotifySettings(db)).subtaskDone) return [];
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.role, ['owner', 'admin']), eq(users.isActive, true), ne(users.id, exceptUserId)));
  return rows.map((r) => r.id);
}
