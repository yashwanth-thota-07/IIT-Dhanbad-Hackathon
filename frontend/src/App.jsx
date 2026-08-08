import ToastProvider, { useToast } from './components/Toast.jsx';
import AuthProvider, { useAuth } from './context/AuthContext.jsx';
import AuthView from './views/AuthView.jsx';
import SellerView from './views/SellerView.jsx';
import BuyerView from './views/BuyerView.jsx';
import OperatorView from './views/OperatorView.jsx';

function Header() {
  const { user, logout } = useAuth();
  const toast = useToast();
  if (!user) return null;
  return (
    <header className="header">
      <div className="container-inner">
        <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
          <span className="brand-mark" aria-hidden="true">
            <svg className="brand-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22V9"></path>
              <path d="M12 9c0-4 2.6-6 7-6 0 4-2.6 6-7 6z"></path>
              <path d="M12 13c0-2.5-1.5-4-4.5-4 0 2.5 1.5 4 4.5 4z"></path>
            </svg>
          </span>
          <span className="brand-name">Agri<span className="brand-accent">OS</span></span>
        </a>
        <div className="header-right">
          <span className="user-chip">
            {user.name} <span className="role-chip">{user.role}</span>
          </span>
          <button className="btn btn-ghost" onClick={() => { logout(); toast('Logged out'); }}>Logout</button>
        </div>
      </div>
    </header>
  );
}

function Shell() {
  const { user, loading } = useAuth();

  if (loading) return <div className="view"><p className="muted">Checking session…</p></div>;

  return (
    <main className={user ? 'main' : 'main main-auth'}>
      {!user ? <AuthView /> : user.role === 'company' ? <BuyerView /> : user.role === 'agrios_operator' ? <OperatorView /> : <SellerView />}
    </main>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <div className="app">
          <Header />
          <Shell />
        </div>
      </ToastProvider>
    </AuthProvider>
  );
}
