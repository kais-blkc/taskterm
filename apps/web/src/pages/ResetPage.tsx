import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { passwordSchema } from '@taskterm/shared';
import { useResetCheck, useResetPassword } from '../api/auth';
import { ApiError } from '../api/client';
import { ROUTES } from '../consts/routes';

/** Новый пароль по ссылке /reset?token=… от администратора */
export function ResetPage() {
  const token = useSearchParams()[0].get('token') ?? '';
  const check = useResetCheck(token);
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const parsed = passwordSchema.safeParse(password);
  const mismatch = repeat !== '' && repeat !== password;
  const unavailable = check.error instanceof ApiError && check.error.status >= 500;

  return (
    <main className="reset-page mx-auto mt-24 max-w-sm px-4">
      <h1 className="page-title mb-6">
        <span className="text-muted">$</span> taskterm reset <span className="cursor" />
      </h1>
      {check.isLoading && <p className="reset-loading text-muted">loading...</p>}
      {(!token || check.isError) && !check.isLoading && (
        <div className="reset-invalid space-y-3">
          <p className="text-danger">! {unavailable ? 'сервер недоступен, попробуй позже' : 'ссылка недействительна или просрочена'}</p>
          <p className="text-muted text-[14px]">// попроси администратора выдать новую</p>
          <Link to={ROUTES.HOME} className="reset-back-link btn inline-block">
            ← ко входу
          </Link>
        </div>
      )}
      {check.data && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (parsed.success && !mismatch) reset.mutate({ token, password });
          }}
          className="reset-form space-y-4"
        >
          <p className="text-muted">
            Новый пароль для <span className="text-fg">@{check.data.username}</span>
          </p>
          <label className="form-field block">
            <span className="text-muted">password:</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
            />
            {password !== '' && !parsed.success && <span className="text-danger">! от 6 до 128 символов</span>}
          </label>
          <label className="form-field block">
            <span className="text-muted">repeat:</span>
            <input
              type="password"
              autoComplete="new-password"
              value={repeat}
              onChange={(e) => setRepeat(e.target.value)}
              className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
            />
            {mismatch && <span className="text-danger">! пароли не совпадают</span>}
          </label>
          {reset.error && <p className="form-error text-danger">! {reset.error.message}</p>}
          <button type="submit" disabled={reset.isPending || !parsed.success || mismatch || !repeat} className="reset-submit btn btn-primary px-3">
            {reset.isPending ? '...' : '> сменить пароль'}
          </button>
        </form>
      )}
    </main>
  );
}
