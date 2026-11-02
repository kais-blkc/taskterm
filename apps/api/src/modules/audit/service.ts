import { desc, lt } from 'drizzle-orm';
import type { AuditEntry } from '@taskterm/shared';
import type { Db } from '../../db/client';
import { auditLog } from '../../db/schema';

/** Запись в журнал. Сбой журнала не должен ломать само действие. */
export async function audit(
  db: Db,
  actor: { id: number; username: string },
  action: string,
  target = '',
  details: Record<string, unknown> = {},
) {
  try {
    await db.insert(auditLog).values({ actorId: actor.id, actorName: actor.username, action, target, details });
  } catch {
    // намеренно проглатываем
  }
}

export async function listAudit(db: Db, limit: number, before?: number): Promise<AuditEntry[]> {
  const rows = await db
    .select()
    .from(auditLog)
    .where(before ? lt(auditLog.id, before) : undefined)
    .orderBy(desc(auditLog.id))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    actorName: r.actorName,
    action: r.action,
    target: r.target,
    details: r.details,
    createdAt: r.createdAt,
  }));
}
