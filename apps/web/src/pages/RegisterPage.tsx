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
    <main className="register-page mx-auto mt-10 max-w-sm sm:mt-24 px-4">
      <h1 className="page-title mb-6">
        <span className="text-muted">$</span> taskterm register <span className="cursor" />
      </h1>
      {check.isLoading && <p className="register-loading text-muted">loading...</p>}
      {invalid && !check.isLoading && (
        <div className="register-invalid space-y-3">
          <p className="text-danger">
            ! {unavailable ? 'сервер недоступен, попробуй позже' : 'приглашение недействительно или просрочено'}
          </p>
          <p className="text-muted text-[14px]">// попроси администратора выслать новую ссылку</p>
          <Link to={ROUTES.HOME} className="register-back-link btn inline-block">
            ← ко входу
          </Link>
        </div>
      )}
      {check.data && (
        <form onSubmit={handleSubmit((v) => reg.mutate({ ...v, token }))} className="register-form space-y-4">
          <p className="text-muted">
            @{check.data.invitedBy} приглашает тебя. Email: <span className="text-fg">{check.data.email}</span>
          </p>
          <label className="form-field block">
            <span className="text-muted">username:</span>
            <input
              autoComplete="username"
              className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
              {...register('username')}
            />
            {errors.username && <span className="text-danger">! {errors.username.message}</span>}
          </label>
          <label className="form-field block">
            <span className="text-muted">password:</span>
            <input
              type="password"
              autoComplete="new-password"
              className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
              {...register('password')}
            />
            {errors.password && <span className="text-danger">! {errors.password.message}</span>}
          </label>
          {reg.error && <p className="form-error text-danger">! {reg.error.message}</p>}
          <button type="submit" disabled={reg.isPending} className="register-submit btn btn-primary px-3">
            {reg.isPending ? '...' : '> create account'}
          </button>
        </form>
      )}
    </main>
  );
}
