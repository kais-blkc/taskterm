import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useSearchParams } from 'react-router-dom';
import { loginSchema, type LoginInput } from '@taskterm/shared';
import { useRegister } from '../api/auth';
import { useInviteCheck } from '../api/invites';
import { ApiError } from '../api/client';
import { ROUTES } from '../consts/routes';

/** Регистрация по ссылке /register?token=… — email фиксирован приглашением */
export function RegisterPage() {
  const token = useSearchParams()[0].get('token') ?? '';
  const check = useInviteCheck(token);
  const reg = useRegister();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const invalid = !token || check.isError;
  const unavailable = check.error instanceof ApiError && check.error.status >= 500;

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6">
        <span className="text-muted">$</span> taskterm register <span className="cursor" />
      </h1>
      {check.isLoading && <p className="text-muted">loading...</p>}
      {invalid && !check.isLoading && (
        <div className="space-y-3">
          <p className="text-danger">
            ! {unavailable ? 'сервер недоступен, попробуй позже' : 'приглашение недействительно или просрочено'}
          </p>
          <p className="text-muted">// попроси администратора выслать новую ссылку</p>
          <Link to={ROUTES.HOME} className="btn inline-block">
            ← ко входу
          </Link>
        </div>
      )}
      {check.data && (
        <form onSubmit={handleSubmit((v) => reg.mutate({ ...v, token }))} className="space-y-4">
          <p className="text-muted">
            @{check.data.invitedBy} приглашает тебя. Email: <span className="text-fg">{check.data.email}</span>
          </p>
          <label className="block">
            <span className="text-muted">username:</span>
            <input
              autoComplete="username"
              className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
              {...register('username')}
            />
            {errors.username && <span className="text-danger">! {errors.username.message}</span>}
          </label>
          <label className="block">
            <span className="text-muted">password:</span>
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
              {...register('password')}
            />
            {errors.password && <span className="text-danger">! {errors.password.message}</span>}
          </label>
          {reg.error && <p className="text-danger">! {reg.error.message}</p>}
          <button type="submit" disabled={reg.isPending} className="btn btn-primary px-3">
            {reg.isPending ? '...' : '> create account'}
          </button>
        </form>
      )}
    </main>
  );
}
