import { useTitle } from '../useTitle.js';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { watchShow } from '../realtime.js';
import { useApi } from '../useApi.js';
import { useAuth } from '../AuthContext.jsx';
import SeatMap, { SeatLegend } from '../components/SeatMap.jsx';
import Poster from '../components/Poster.jsx';
import { ErrorState, Loading } from '../components/State.jsx';
import { errorText, fmtDateTime, money } from '../format.js';

const MAX_SEATS = 8; // mirrors the server default (MAX_SEATS_PER_BOOKING); the server enforces it
const POLL_MS = 15000; // fallback only; Socket.IO pushes updates instantly

export default function SeatSelection() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const show = useApi(`/shows/${id}`);
  useTitle(show.data ? `Seats – ${show.data.movie.title}` : 'Select seats');
  const [map, setMap] = useState(null);
  const [mapError, setMapError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [notice, setNotice] = useState('');
  const [problem, setProblem] = useState(null); // { text, bookingId }
  const [busy, setBusy] = useState(false);

  const loadSeats = useCallback(() => api(`/shows/${id}/seats`).then((r) => {
    setMap(r.data); setMapError(null);
    // drop selected seats that someone else just took
    setSelected((prev) => {
      const ok = new Set(r.data.seats.filter((s) => s.status === 'AVAILABLE').map((s) => s.label));
      const next = new Set([...prev].filter((l) => ok.has(l)));
      if (next.size !== prev.size) setNotice('Some seats you selected were just taken and were removed from your selection.');
      return next;
    });
  }).catch((e) => setMapError(e)), [id]);

  useEffect(() => { loadSeats(); }, [loadSeats, user]);
  useEffect(() => watchShow(id, loadSeats), [id, loadSeats]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) loadSeats(); }, POLL_MS);
    return () => clearInterval(t);
  }, [loadSeats]);

  const toggle = (seat) => {
    setNotice(''); setProblem(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(seat.label)) next.delete(seat.label);
      else if (next.size >= MAX_SEATS) setNotice(`You can select up to ${MAX_SEATS} seats.`);
      else next.add(seat.label);
      return next;
    });
  };

  const chosen = (map?.seats || []).filter((s) => selected.has(s.label));
  const total = chosen.reduce((sum, s) => sum + s.price, 0); // display only - the server recomputes the total

  const reserve = async () => {
    setBusy(true); setProblem(null); setNotice('');
    try {
      const r = await api('/bookings/reserve', { method: 'POST', body: { showId: id, seats: [...selected] } });
      navigate(`/bookings/${r.data.id}`);
    } catch (e) {
      setProblem({ text: e.status === 409 && e.details?.unavailableSeats ? `${e.message}: ${e.details.unavailableSeats.join(', ')}` : errorText(e), bookingId: e.details?.bookingId });
      await loadSeats();
      setBusy(false);
    }
  };

  if (show.loading) return <Loading label="Loading show…" />;
  if (show.error) return <ErrorState error={show.error} onRetry={show.reload} />;
  const s = show.data;

  return (
    <>
      <nav aria-label="Breadcrumb" className="small mb-2"><Link to={`/movies/${s.movie.id}`}>← {s.movie.title}</Link></nav>
      <div className="d-flex gap-3 align-items-center mb-3">
        <Poster title={s.movie.title} url={s.movie.posterUrl} className="poster-thumb" decorative />
        <div>
          <h1 className="h3 mb-0">{s.movie.title}</h1>
          <p className="text-secondary mb-0">{s.theater.name} · {s.screenName} · {fmtDateTime(s.startsAt)}</p>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12 col-lg-8">
          {!map && !mapError && <Loading label="Loading seats…" />}
          {mapError && <ErrorState error={mapError} onRetry={loadSeats} />}
          {map && (
            <>
              <SeatLegend />
              <SeatMap seats={map.seats} selected={selected} onToggle={toggle} />
              <p className="small text-secondary mt-2" aria-live="polite">{map.summary.AVAILABLE} seats available · live updates, with a backup refresh every {POLL_MS / 1000}s</p>
            </>
          )}
        </div>
        <aside className="col-12 col-lg-4" aria-label="Booking summary">
          <div className="card im-card sticky-lg-top summary-card">
            <div className="card-body">
              <h2 className="h5">Your selection</h2>
              {chosen.length === 0 ? <p className="text-secondary small">Select up to {MAX_SEATS} seats.</p> : (
                <ul className="list-unstyled small mb-3">
                  {chosen.map((c) => <li key={c.label} className="d-flex justify-content-between"><span>{c.label} <span className="text-secondary">({c.category.toLowerCase()})</span></span><span>{money(c.price)}</span></li>)}
                </ul>
              )}
              <div className="d-flex justify-content-between fw-bold border-top pt-2 mb-3"><span>Total</span><span>{money(total)}</span></div>
              {notice && <div className="alert alert-warning py-2 small" role="status">{notice}</div>}
              {problem && (
                <div className="alert alert-danger py-2 small" role="alert">
                  {problem.text}{problem.bookingId && <> <Link to={`/bookings/${problem.bookingId}`}>View pending reservation</Link></>}
                </div>
              )}
              {user ? (
                <button className="btn btn-accent w-100" disabled={chosen.length === 0 || busy} onClick={reserve}>{busy ? 'Reserving…' : `Reserve ${chosen.length || ''} seat${chosen.length === 1 ? '' : 's'}`}</button>
              ) : (
                <Link className="btn btn-accent w-100" to="/login" state={{ from: `/shows/${id}/seats` }}>Log in to reserve</Link>
              )}
              <p className="small text-secondary mt-2 mb-0">Seats are held for a few minutes after you reserve. Final price is confirmed by the server.</p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
