import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { credentialsSchema, loginSchema, type Credentials } from '@taskterm/shared';
import { useAuth } from '../api/auth';

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const auth = useAuth(mode);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Credentials>({ resolver: zodResolver(mode === 'login' ? loginSchema : credentialsSchema) as never });

  const field = (name: keyof Credentials, label: string, type = 'text') => (
    <label className="block">
      <span className="text-muted">{label}:</span>
      <input
        type={type}
        autoComplete={name === 'password' ? (mode === 'login' ? 'current-password' : 'new-password') : 'off'}
        className="mt-1 block w-full border border-line bg-elev px-2 py-1 text-fg outline-none focus:border-accent"
        {...register(name)}
      />
      {errors[name] && <span className="text-danger">! {errors[name]!.message}</span>}
    </label>
  );

  return (
    <main className="mx-auto mt-24 max-w-sm px-4">
      <h1 className="mb-6">
        <span className="text-muted">$</span> taskterm <span className="cursor" />
      </h1>
      <div className="mb-4 flex gap-4">
        {(['login', 'register'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`btn ${mode === m ? 'btn-active' : ''}`}
          >
            {m}
          </button>
        ))}
      </div>
      <form onSubmit={handleSubmit((v) => auth.mutate(v))} className="space-y-4">
        {field('username', 'username')}
        {field('password', 'password', 'password')}
        {mode === 'register' && field('accessPassword', 'access key', 'password')}
        {auth.error && <p className="text-danger">! {auth.error.message}</p>}
        <button
          type="submit"
          disabled={auth.isPending}
          className="btn btn-primary px-3"
        >
          {auth.isPending ? '...' : `> ${mode}`}
        </button>
      </form>
    </main>
  );
}
