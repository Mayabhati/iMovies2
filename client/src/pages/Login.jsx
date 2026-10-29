import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { errorText } from '../format.js';

export default function Login() {
  useTitle('Log in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={from} replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await login(email, password); navigate(from, { replace: true }); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <div className="auth-box mx-auto">
      <h1 className="h3 mb-3">Log in</h1>
      {from !== '/' && <div className="alert alert-info py-2">Please log in to continue.</div>}
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      <form onSubmit={submit} noValidate>
        <div className="mb-3"><label htmlFor="email" className="form-label">Email</label>
          <input id="email" type="email" className="form-control" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="mb-3"><label htmlFor="password" className="form-label">Password</label>
          <input id="password" type="password" className="form-control" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn btn-accent w-100" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="mt-3 small text-secondary">New here? <Link to="/register" state={{ from }}>Create an account</Link></p>
    </div>
  );
}
