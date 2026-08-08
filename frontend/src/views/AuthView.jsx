import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';

function BrandMark() {
  return (
    <span className="auth-brand-mark" aria-hidden="true">
      <svg className="auth-brand-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22V9"></path>
        <path d="M12 9c0-4 2.6-6 7-6 0 4-2.6 6-7 6z"></path>
        <path d="M12 13c0-2.5-1.5-4-4.5-4 0 2.5 1.5 4 4.5 4z"></path>
      </svg>
    </span>
  );
}

function IntroPanel() {
  return (
    <div className="auth-intro">
      <div>
        <span className="auth-brand">
          <BrandMark />
          <span>Agri<span className="brand-accent">OS</span></span>
        </span>
        <h1 className="auth-title">A smarter way to move value from farm to market.</h1>
        <p className="auth-tagline">
          Connecting company demand with farmers through a transparent, structured value-distribution model.
        </p>
      </div>

      <div className="auth-blocks">
        <div className="auth-block">
          <span className="auth-block-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </span>
          <div>
            <h3 className="auth-block-title">For Companies</h3>
            <p className="auth-block-text">Reliable, structured agricultural procurement with clearer fulfilment and transaction visibility.</p>
          </div>
        </div>
        <div className="auth-block">
          <span className="auth-block-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22V9"></path>
              <path d="M12 9c0-4 2.6-6 7-6 0 4-2.6 6-7 6z"></path>
              <path d="M12 13c0-2.5-1.5-4-4.5-4 0 2.5 1.5 4 4.5 4z"></path>
            </svg>
          </span>
          <div>
            <h3 className="auth-block-title">For Farmers</h3>
            <p className="auth-block-text">A defined share of company value with measurable improvement in the price received for produce.</p>
          </div>
        </div>
        <div className="auth-block">
          <span className="auth-block-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </span>
          <div>
            <h3 className="auth-block-title">For Procurement Partners</h3>
            <p className="auth-block-text">Transparent ₹2/kg service-based earnings for procurement instead of an opaque margin.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuthView() {
  const { login, register } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState('login');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('middleman');
  const [busy, setBusy] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login({ email, password });
      toast('Login successful');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ name, email, password, role });
      toast('Registered! Please login now');
      setMode('login');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const field = (label, value, setter, type = 'text', placeholder = '') => (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(e) => setter(e.target.value)} required />
    </label>
  );

  return (
    <div className="auth-wrap">
      <IntroPanel />

      <div className="auth-form">
        <div className="auth-card">
          <h1 className="auth-logo">Agri<span className="brand-accent">OS</span></h1>
          <p className="auth-tag">Connecting company deals directly to middlemen.</p>

          <div className="tabs">
            <button className={`tab ${mode === 'login' ? 'active' : ''}`} onClick={() => setMode('login')}>Login</button>
            <button className={`tab ${mode === 'register' ? 'active' : ''}`} onClick={() => setMode('register')}>Register</button>
          </div>

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="form">
              {field('Email', email, setEmail, 'email', 'you@example.com')}
              {field('Password', password, setPassword, 'password', '••••••')}
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Logging in…' : 'Login'}</button>
              <p className="hint">New here? <a onClick={() => setMode('register')}>Register</a> instead.</p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="form">
              {field('Name', name, setName, 'text', 'Full name')}
              {field('Email', email, setEmail, 'email', 'you@example.com')}
              {field('Password (min 6 chars)', password, setPassword, 'password', '••••••')}
              <label className="field">
                <span>I want to…</span>
                <select value={role} onChange={(e) => setRole(e.target.value)}>
                  <option value="middleman">Supply produce (Middleman)</option>
                  <option value="company">Post requirements (Company)</option>
                  <option value="agrios_operator">AgriOS Operator</option>
                </select>
              </label>
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Register'}</button>
              <p className="hint">Already registered? <a onClick={() => setMode('login')}>Login</a> instead.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
