import { useTitle } from '../useTitle.js';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApi } from '../useApi.js';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';
import { fmtDateTime } from '../format.js';

export default function Notifications() {
  useTitle('Notifications');
  const { data, meta, loading, error, reload } = useApi('/notifications');
  if (loading && !data) return <Loading label="Loading notifications…" />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const changed = () => window.dispatchEvent(new Event('notifications:changed'));
  const markAll = async () => { await api('/notifications/read-all', { method: 'POST' }); reload(); changed(); };
  const markOne = async (id) => { await api(`/notifications/${id}/read`, { method: 'POST' }); reload(); changed(); };
  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h1 className="h3 mb-0">Notifications</h1>
        {meta?.unread > 0 && <button className="btn btn-outline-light btn-sm" onClick={markAll}>Mark all read ({meta.unread})</button>}
      </div>
      {data.length === 0 ? <EmptyState title="No notifications yet" /> : (
        <ul className="list-group">
          {data.map((n) => (
            <li key={n.id} className={`list-group-item bg-transparent ${n.readAt ? 'text-secondary' : 'border-start border-warning border-3'}`}>
              <div className="d-flex justify-content-between gap-2">
                <strong>{n.title}</strong><span className="small">{fmtDateTime(n.createdAt)}</span>
              </div>
              <div className="small">{n.message}</div>
              <div className="small mt-1">
                {n.booking && <Link to={`/bookings/${n.booking}`} className="me-3">View booking</Link>}
                {!n.readAt && <button className="btn btn-link btn-sm p-0" onClick={() => markOne(n.id)}>Mark read</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
