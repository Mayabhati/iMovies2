import { useTitle } from '../useTitle.js';
import { Link } from 'react-router-dom';
import { useApi } from '../useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';
import Poster from '../components/Poster.jsx';
import { fmtDateTime, money } from '../format.js';

const COLORS = { PENDING: 'warning', CONFIRMED: 'success', CANCELLED: 'secondary', EXPIRED: 'secondary', FAILED: 'danger' };
export const StatusBadge = ({ status }) => <span className={`badge text-bg-${COLORS[status] || 'secondary'}`}>{status}</span>;

export default function MyBookings() {
  useTitle('My bookings');
  const { data, loading, error, reload } = useApi('/bookings/mine');
  if (loading) return <Loading label="Loading your bookings…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <>
      <h1 className="h3 mb-3">My bookings</h1>
      {data.length === 0 ? (
        <EmptyState title="No bookings yet"><Link to="/" className="btn btn-accent btn-sm mt-2">Browse movies</Link></EmptyState>
      ) : (
        <div className="list-group">
          {data.map((b) => (
            <Link key={b.id} to={`/bookings/${b.id}`} className="list-group-item list-group-item-action bg-transparent d-flex align-items-start gap-3">
              <Poster title={b.show?.movie?.title || 'Movie'} url={b.show?.movie?.posterUrl} className="poster-thumb" decorative />
              <div className="flex-grow-1">
                <div className="fw-semibold">{b.show?.movie?.title}</div>
                <div className="small text-secondary">{b.show?.theater?.name} · {b.show && fmtDateTime(b.show.startsAt)}</div>
                <div className="small">Seats: {b.seats.map((s) => s.label).join(', ')} · <span className="font-monospace">{b.reference}</span></div>
              </div>
              <div className="text-end ms-auto"><StatusBadge status={b.status} /><div className="mt-1">{money(b.totalAmount)}</div></div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
