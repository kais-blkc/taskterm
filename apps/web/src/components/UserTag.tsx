export function ColorDot({ color, className = '' }: { color: string; className?: string }) {
  return <i className={`color-dot inline-block h-2.5 w-2.5 shrink-0 ${className}`} style={{ background: color }} />;
}

/** Имя пользователя его цветом — чтобы отличать людей «на глаз» */
export function UserTag({
  user,
  fallback = '…',
  className = '',
}: {
  user?: { username: string; color: string } | null;
  fallback?: string;
  className?: string;
}) {
  if (!user) return <span className={`user-tag text-muted ${className}`}>@{fallback}</span>;
  return (
    <span className={`user-tag ${className}`} style={{ color: user.color }}>
      @{user.username}
    </span>
  );
}
