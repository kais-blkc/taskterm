import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@taskterm/shared';
import { useLogin } from '../api/auth';

/** Вход. Регистрации здесь нет: аккаунт создаётся только по ссылке-приглашению от администратора. */
export function AuthPage() {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const field = (name: keyof LoginInput, label: string, type = 'text') => (
    <label className="form-field block">
      <span className="text-muted">{label}:</span>
      <input
        type={type}
        autoComplete={name === 'password' ? 'current-password' : 'username'}
        className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
        {...register(name)}
      />
      {errors[name] && <span className="text-danger">! {errors[name]!.message}</span>}
    </label>
  );

  return (
    <main className="login-page mx-auto mt-24 max-w-sm px-4">
      <h1 className="page-title mb-6">
        <span className="text-muted">$</span> taskterm <span className="cursor" />
      </h1>
      <form onSubmit={handleSubmit((v) => login.mutate(v))} className="login-form space-y-4">
        {field('username', 'username')}
        {field('password', 'password', 'password')}
        {login.error && <p className="form-error text-danger">! {login.error.message}</p>}
        <button type="submit" disabled={login.isPending} className="login-submit btn btn-primary px-3">
          {login.isPending ? '...' : '> login'}
        </button>
      </form>
      <p className="login-hint mt-6 text-xs text-muted">// доступ только по приглашению — попроси ссылку у администратора</p>
    </main>
  );
}
