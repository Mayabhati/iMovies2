import { useTitle } from '../useTitle.js';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import Countdown from '../components/Countdown.jsx';
import Poster from '../components/Poster.jsx';
import { ErrorState, Loading } from '../components/State.jsx';
import { StatusBadge } from './MyBookings.jsx';
import { errorText, fmtDateTime, money } from '../format.js';

export default function BookingDetail() {
  const { id } = useParams();
  const justPaid = useLocation().state?.paid;
  const { data: b, loading, error, reload } = useApi(`/bookings/${id}`);
  useTitle(b ? `Booking ${b.reference}` : 'Booking');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading && !b) return <Loading label="Loading booking…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const act = async (path, confirmText) => {
    if (!window.confirm(confirmText)) return;
    setBusy(true); setMsg('');
    try { await api(`/bookings/${id}/${path}`, { method: 'POST' }); } catch (e) { setMsg(errorText(e)); }
    setBusy(false); reload();
  };
  const show = b.show;
  const refunded = b.payments?.some((p) => p.status === 'REFUNDED');

  return (
    <div className="mx-auto" style={{ maxWidth: 640 }}>
      <nav aria-label="Breadcrumb" className="small mb-2"><Link to="/bookings">← My bookings</Link></nav>

      {b.status === 'CONFIRMED' && justPaid === 'SUCCEEDED' && (
        <div className="alert alert-success" role="status"><strong>🎉 Payment successful — your booking is confirmed!</strong> Show this reference at the cinema.</div>
      )}
      {b.status === 'FAILED' && (
        <div className="alert alert-danger" role="alert">
          <strong>Payment failed.</strong> Your simulated payment was declined, so no booking was made and your seats were released.{' '}
          <Link to={`/shows/${show.id}/seats`} className="alert-link">Choose seats again</Link>
        </div>
      )}

      <div className="card im-card">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <div><div className="small text-secondary">Booking reference</div><div className="h4 mb-0 font-monospace">{b.reference}</div></div>
            <StatusBadge status={b.status} />
          </div>
          <div className="d-flex gap-3 mb-3">
            <Poster title={show.movie.title} url={show.movie.posterUrl} className="poster-thumb" decorative />
            <div>
              <h1 className="h5">{show.movie.title}</h1>
              <p className="text-secondary mb-0">{show.theater.name} · {show.screenName}<br />{fmtDateTime(show.startsAt)}</p>
            </div>
          </div>
          <ul className="list-group list-group-flush mb-3">
            {b.seats.map((s) => <li key={s.label} className="list-group-item bg-transparent d-flex justify-content-between"><span>Seat {s.label} <span className="text-secondary small">({s.category.toLowerCase()})</span></span><span>{money(s.price)}</span></li>)}
            <li className="list-group-item bg-transparent d-flex justify-content-between fw-bold"><span>Total</span><span>{money(b.totalAmount)}</span></li>
          </ul>

          {b.payments?.length > 0 && (
            <div className="mb-3">
              <h2 className="h6">Payment <span className="badge text-bg-secondary">simulated</span></h2>
              <ul className="list-unstyled small mb-0">
                {b.payments.map((p) => <li key={p.id}>{money(p.amount)} · <strong>{p.status}</strong>{p.transactionRef ? ` · ${p.transactionRef}` : ''}{p.failureReason ? ` · ${p.failureReason}` : ''}</li>)}
              </ul>
            </div>
          )}
          {msg && <div className="alert alert-danger py-2" role="alert">{msg}</div>}

          {b.status === 'PENDING' && (
            <>
              <div className="alert alert-warning" role="status">Seats held for <Countdown until={b.expiresAt} onExpire={reload} />. After that they are released automatically.</div>
              <div className="d-flex gap-2 flex-wrap">
                <Link className="btn btn-accent" to={`/bookings/${id}/checkout`}>Proceed to payment</Link>
                <button className="btn btn-outline-danger" disabled={busy} onClick={() => act('release', 'Release these seats? They will become available to others.')}>Release seats</button>
              </div>
            </>
          )}
          {b.status === 'CONFIRMED' && b.cancellation && (
            <>
              <p className="small text-secondary">
                {b.cancellation.allowed ? `Free cancellation until ${fmtDateTime(b.cancellation.deadline)}.` : b.cancellation.reason}
              </p>
              <button className="btn btn-outline-danger" disabled={busy || !b.cancellation.allowed}
                onClick={() => act('cancel', 'Cancel this booking? Your seats will be released and the simulated payment refunded.')}>Cancel booking</button>
            </>
          )}
          {b.status === 'CANCELLED' && <div className="alert alert-secondary mb-0">{b.confirmedAt ? `This booking was cancelled${refunded ? ' and the simulated payment refunded' : ''}.` : 'This reservation was released.'}</div>}
          {b.status === 'EXPIRED' && <div className="alert alert-secondary mb-0">This reservation expired and the seats were released. <Link to={`/shows/${show.id}/seats`}>Pick seats again</Link></div>}
        </div>
      </div>
    </div>
  );
}
