import { useTitle } from '../../useTitle.js';
import { useRef, useState } from 'react';
import { useApi } from '../../useApi.js';
import { ErrorState, Loading } from '../../components/State.jsx';
import { money } from '../../format.js';
import AdminMovies from './AdminMovies.jsx';
import AdminTheaters from './AdminTheaters.jsx';
import AdminShows from './AdminShows.jsx';
import AdminBookings from './AdminBookings.jsx';

const TABS = [['dashboard', 'Dashboard'], ['movies', 'Movies'], ['theaters', 'Theaters'], ['shows', 'Shows'], ['bookings', 'Bookings']];

function Dashboard() {
  const { data: s, loading, error, reload } = useApi('/admin/stats');
  if (loading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const cards = [['Active movies', s.movies], ['Theaters', s.theaters], ['Upcoming shows', s.upcomingShows], ['Customers', s.customers],
    ['Confirmed bookings', s.bookingsByStatus.CONFIRMED || 0], ['Confirmed revenue (simulated)', money(s.confirmedRevenue)]];
  return (
    <div className="row g-3">
      {cards.map(([t, v]) => <div className="col-6 col-md-4" key={t}><div className="card im-card"><div className="card-body"><div className="small text-secondary">{t}</div><div className="h3 mb-0">{v}</div></div></div></div>)}
      <div className="col-12 small text-secondary">Bookings by status: {Object.entries(s.bookingsByStatus).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none yet'}</div>
    </div>
  );
}

export default function Admin() {
  useTitle('Admin');
  const [tab, setTab] = useState('dashboard');
  const refs = useRef({});
  const onKey = (e, i) => { // roving tabindex + arrow keys (WAI-ARIA tabs pattern)
    const target = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (target === undefined) return;
    e.preventDefault();
    const next = TABS[(target + TABS.length) % TABS.length][0];
    setTab(next);
    refs.current[next]?.focus();
  };
  return (
    <>
      <h1 className="h3 mb-3">Admin</h1>
      <div role="tablist" aria-label="Admin sections" className="nav nav-pills mb-4 flex-wrap gap-1">
        {TABS.map(([k, t], i) => (
          <button key={k} ref={(el) => { refs.current[k] = el; }} id={`tab-${k}`} role="tab" type="button" aria-selected={tab === k} aria-controls={`panel-${k}`}
            tabIndex={tab === k ? 0 : -1} className={`nav-link ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)} onKeyDown={(e) => onKey(e, i)}>{t}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0}>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'movies' && <AdminMovies />}
        {tab === 'theaters' && <AdminTheaters />}
        {tab === 'shows' && <AdminShows />}
        {tab === 'bookings' && <AdminBookings />}
      </div>
    </>
  );
}
