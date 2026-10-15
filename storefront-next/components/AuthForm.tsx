'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { useAuth } from '@/lib/auth-context';

export function AuthForm() {
  const router = useRouter();
  const { login, register } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, fullName);
      }

      router.push('/catalog');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось выполнить вход');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card auth-card">
        <h1 className="auth-title">{mode === 'login' ? 'Вход в аккаунт' : 'Регистрация'}</h1>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => setMode('login')}
          >
            Вход
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'auth-tab active' : 'auth-tab'}
            onClick={() => setMode('register')}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          {mode === 'register' ? (
            <div className="field">
              <label>Имя и фамилия</label>
              <input
                className="input"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
          ) : null}

          <div className="field">
            <label>Пароль</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error ? <div className="error">{error}</div> : null}

          <button className="button primary large" disabled={loading}>
            {loading
              ? 'Выполняется...'
              : mode === 'login'
                ? 'Войти'
                : 'Зарегистрироваться'}
          </button>
        </form>
      </div>
    </div>
  );
}