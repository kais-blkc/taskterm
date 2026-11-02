import { useEffect, useRef, useState } from 'react';
import { COLOR_MIN_DISTANCE, USER_PALETTE, colorDistance, type User } from '@taskterm/shared';
import { useSetColor, useUsers } from '../api/users';
import { UserTag } from './UserTag';

export function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const users = useUsers();
  const setColor = useSetColor();
  const others = (users.data ?? []).filter((u) => u.id !== user.id);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // кто уже занял похожий цвет
  const takenBy = (color: string) =>
    others.find((o) => o.color && colorDistance(color, o.color) < COLOR_MIN_DISTANCE);

  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen(!open)} title="сменить цвет">
        <UserTag user={user} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-64 space-y-3 border border-line bg-elev p-3 shadow-lg">
          <div className="text-muted">твой цвет</div>
          <div className="grid grid-cols-8 gap-1.5">
            {USER_PALETTE.map((c) => {
              const owner = takenBy(c);
              const selected = c.toLowerCase() === user.color.toLowerCase();
              return (
                <button
                  key={c}
                  type="button"
                  disabled={!!owner || setColor.isPending}
                  title={owner ? `занят @${owner.username}` : c}
                  onClick={() => setColor.mutate(c)}
                  className={`h-6 w-6 border ${selected ? 'border-fg outline outline-1 outline-offset-1 outline-fg' : 'border-line'} disabled:opacity-25`}
                  style={{ background: c }}
                />
              );
            })}
          </div>
          <label className="flex items-center justify-between">
            <span className="text-muted">свой</span>
            <input
              type="color"
              value={user.color}
              onChange={(e) => setColor.mutate(e.target.value)}
              className="h-6 w-10 border border-line bg-transparent"
            />
          </label>
          {setColor.error && <p className="text-danger">! {setColor.error.message}</p>}
          <p className="text-xs text-muted">цвет не должен быть похож на цвет другого пользователя</p>
        </div>
      )}
    </div>
  );
}
