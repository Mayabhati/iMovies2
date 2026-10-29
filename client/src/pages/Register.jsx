import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext.jsx';
import { errorText } from '../format.js';

export default function Register() {
  useTitle('Create account');
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  if (user) return <Navigate to={from} replace />;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await register(form.name, form.email, form.password); navigate(from, { replace: true }); }
    catch (err) { setError(errorText(err)); setBusy(false); }
  };
  return (
    <div className="auth-box mx-auto">
      <h1 className="h3 mb-3">Create your account</h1>
      {error && <div className="alert alert-danger py-2" role="alert">{error}</div>}
      <form onSubmit={submit} noValidate>
        <div className="mb-3"><label htmlFor="name" className="form-label">Full name</label>
          <input id="name" className="form-control" autoComplete="name" required value={form.name} onChange={set('name')} /></div>
        <div className="mb-3"><label htmlFor="email" className="form-label">Email</label>
          <input id="email" type="email" className="form-control" autoComplete="email" required value={form.email} onChange={set('email')} /></div>
        <div className="mb-3"><label htmlFor="password" className="form-label">Password</label>
          <input id="password" type="password" className="form-control" autoComplete="new-password" required aria-describedby="pw-help" value={form.password} onChange={set('password')} />
          <div id="pw-help" className="form-text">At least 8 characters, including a letter and a number.</div></div>
        <button className="btn btn-accent w-100" disabled={busy}>{busy ? 'Creating account…' : 'Sign up'}</button>
      </form>
      <p className="mt-3 small text-secondary">Already registered? <Link to="/login" state={{ from }}>Log in</Link></p>
    </div>
  );
}
