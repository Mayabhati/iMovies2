import { useState } from 'react';
import { useCallback, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../AuthContext.jsx';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [unreadRaw, setUnread] = useState(0);
  const unread = user ? unreadRaw : 0; // logged-out users never show a badge
  const refreshUnread = useCallback(() => {
    if (!user) return;
    api('/notifications?limit=1').then((r) => setUnread(r.meta?.unread || 0)).catch(() => {});
  }, [user]);
  useEffect(() => { refreshUnread(); }, [refreshUnread, pathname]);
  useEffect(() => {
    const onVisible = () => { if (!document.hidden) refreshUnread(); };
    window.addEventListener('notifications:changed', refreshUnread); // fired by the Notifications page after mark-read
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('notifications:changed', refreshUnread); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshUnread]);
  const close = () => setOpen(false);
  const onLogout = async () => { close(); await logout(); navigate('/'); };

  return (
    <nav className="navbar navbar-expand-md im-nav" aria-label="Main">
      <div className="container">
        <Link className="navbar-brand fw-bold" to="/" onClick={close}>🎬 i<span className="text-accent">Movies</span></Link>
        <button className="navbar-toggler" type="button" aria-expanded={open} aria-controls="nav-menu" aria-label="Toggle navigation" onClick={() => setOpen((o) => !o)}>
          <span className="navbar-toggler-icon" />
        </button>
        <div id="nav-menu" className={`collapse navbar-collapse ${open ? 'show' : ''}`}>
          <ul className="navbar-nav me-auto">
            <li className="nav-item"><NavLink className="nav-link" to="/" end onClick={close}>Movies</NavLink></li>
            {user && <li className="nav-item"><NavLink className="nav-link" to="/bookings" onClick={close}>My bookings</NavLink></li>}
            {user && (
              <li className="nav-item"><NavLink className="nav-link" to="/notifications" onClick={close}>
                Notifications{unread > 0 && <span className="badge text-bg-danger ms-1" aria-label={`${unread} unread`}>{unread}</span>}
              </NavLink></li>
            )}
            {user?.role === 'ADMIN' && <li className="nav-item"><NavLink className="nav-link" to="/admin" onClick={close}>Admin</NavLink></li>}
          </ul>
          <ul className="navbar-nav align-items-md-center gap-md-2">
            {user ? (
              <>
                <li className="nav-item navbar-text">Hi, {user.name.split(' ')[0]}</li>
                <li className="nav-item"><button className="btn btn-outline-light btn-sm" onClick={onLogout}>Log out</button></li>
              </>
            ) : (
              <>
                <li className="nav-item"><NavLink className="nav-link" to="/login" onClick={close}>Log in</NavLink></li>
                <li className="nav-item"><Link className="btn btn-accent btn-sm" to="/register" onClick={close}>Sign up</Link></li>
              </>
            )}
          </ul>
        </div>
      </div>
    </nav>
  );
}
