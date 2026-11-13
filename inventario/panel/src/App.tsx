import { useEffect, useState, type FormEvent } from 'react';
import type { Session, InternalClient } from './client';
import { Panel } from './Panel';
export function App({ client }: { client: InternalClient | null }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    if (!client) return;
    let active = true;
    let changed = false;
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, next) => {
      changed = true;
      if (active) { setSession(next); setLoading(false); }
    });
    client.auth.getSession().then(({ data, error }) => {
      if (active && !changed) { setSession(error ? null : data.session); setLoading(false); }
    }).catch(() => { if (active) { setError('No se pudo recuperar la sesión. Intenta nuevamente.'); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [client]);
  if (!client) return <main><h1>Panel interno TCA</h1><p role="alert">No se pudo configurar el acceso al servidor local.</p></main>;
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || busy) return;
    setBusy(true); setError('');
    try {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) setError(error.code === 'invalid_credentials' ? 'Correo o contraseña incorrectos.' : 'No se pudo iniciar sesión. Verifica tu cuenta y conexión e intenta nuevamente.');
    } catch { setError('No se pudo conectar. Intenta nuevamente.'); }
    finally { setPassword(''); setBusy(false); }
  }
  async function logout() {
    if (!client || busy) return;
    setBusy(true); setError('');
    try {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) setError('No se pudo cerrar sesión. Intenta nuevamente.');
      else setSession(null);
    } catch { setError('No se pudo cerrar sesión. Revisa tu conexión.'); }
    finally { setBusy(false); }
  }
  return <main><h1>Panel interno TCA</h1>{error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Comprobando sesión…</p> : session ? <>
      <header><p>Sesión: {session.user.email}</p><button disabled={busy} onClick={logout}>Cerrar sesión</button></header>
      {!busy && <Panel key={session.user.id} client={client} />}
    </> : <form onSubmit={login}><h2>Iniciar sesión</h2>
      <label>Correo<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar'}</button>
    </form>}
  </main>;
}
