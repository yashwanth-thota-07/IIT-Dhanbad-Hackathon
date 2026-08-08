import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

const TOKEN_KEY = 'agrios_token';
const USER_KEY = 'agrios_user';

// Session storage keeps each tab's login independent, so Company, Middleman and
// Operator portals can be logged in at the same time in different tabs.
const storage = window.sessionStorage;

export default function AuthProvider({ children }) {
  const [token, setToken] = useState(() => storage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(storage.getItem(USER_KEY) || 'null'); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api('/api/auth/me', { token })
      .then((res) => { if (!cancelled) setUser(res.user); })
      .catch(() => { if (!cancelled) logout(); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (credentials) => {
    const res = await api('/api/auth/login', { method: 'POST', body: credentials });
    storage.setItem(TOKEN_KEY, res.token);
    storage.setItem(USER_KEY, JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
    return res;
  };

  const register = (data) => api('/api/auth/register', { method: 'POST', body: data });

  const logout = () => {
    storage.removeItem(TOKEN_KEY);
    storage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
