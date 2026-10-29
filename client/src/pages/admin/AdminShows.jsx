import { useState } from 'react';
import { api } from '../../api.js';
import { useApi } from '../../useApi.js';
import { EmptyState, ErrorState, Loading } from '../../components/State.jsx';
import { Field, FormAlert } from '../../components/AdminBits.jsx';
import { errorText, fmtDateTime } from '../../format.js';

const blank = { movie: '', theater: '', screenName: '', startsAt: '', standard: 200, premium: 350 };
const localInputDate = (value) => {
  const d = new Date(value);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

export default function AdminShows() {
  const shows = useApi('/shows?limit=100');
  const movies = useApi('/movies?status=nowShowing&limit=50');
  const theaters = useApi('/theaters');
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [msg, setMsg] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v, ...(k === 'theater' ? { screenName: '' } : {}) }));
  const screens = theaters.data?.find((t) => t.id === form?.theater)?.screens || [];

  const openCreate = () => { setEditingId(null); setForm({ ...blank }); setMsg(''); setFlash(''); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setForm({ movie: s.movie.id, theater: s.theater.id, screenName: s.screenName, startsAt: localInputDate(s.startsAt), standard: s.pricing.standard, premium: s.pricing.premium });
    setMsg(''); setFlash('');
  };
  const closeForm = () => { if (busy) return; setForm(null); setEditingId(null); setMsg(''); };

  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setMsg(''); setFlash('');
    try {
      const body = { movie: form.movie, theater: form.theater, screenName: form.screenName,
        startsAt: new Date(form.startsAt).toISOString(), pricing: { standard: Number(form.standard), premium: Number(form.premium) } };
      if (editingId) {
        await api(`/shows/${editingId}`, { method: 'PUT', body });
        setFlash('Show updated. Existing bookings and their seat-price snapshots were preserved.');
      } else {
        await api('/shows', { method: 'POST', body });
        setFlash('Show created with its seat inventory.');
      }
      setForm(null); setEditingId(null); shows.reload();
    } catch (err) { setMsg(errorText(err)); }
    finally { setBusy(false); }
  };
  const remove = async (s) => {
    if (!window.confirm(`Delete the ${fmtDateTime(s.startsAt)} show of "${s.movie.title}"? Shows with booking history cannot be deleted.`)) return;
    setFlash('');
    try { await api(`/shows/${s.id}`, { method: 'DELETE' }); setFlash('Show deleted.'); shows.reload(); }
    catch (err) { setFlash(errorText(err)); }
  };

  return (
    <>
      <div className="d-flex justify-content-between mb-3"><h2 className="h5 mb-0">Upcoming shows</h2>{!form && <button className="btn btn-accent btn-sm" onClick={openCreate}>+ Add show</button>}</div>
      {flash && <div className="alert alert-info py-2" role="status">{flash}</div>}
      {form && (
        <form className="card im-card mb-4" onSubmit={save}><div className="card-body">
          <h3 className="h6">{editingId ? 'Edit show' : 'New show'}</h3>
          {editingId && <p className="small text-secondary">Changes to movie, theater, screen or start time are blocked when booking history exists. Price changes apply only to currently available seats; held and booked seat prices are preserved.</p>}
          <FormAlert msg={msg} />
          <div className="row g-2">
            <div className="col-md-4"><Field id="sh-m" label="Movie (release date enforced)"><select id="sh-m" className="form-select" required value={form.movie} onChange={(e) => set('movie', e.target.value)}><option value="">Select…</option>{(movies.data || []).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></Field></div>
            <div className="col-md-4"><Field id="sh-t" label="Theater"><select id="sh-t" className="form-select" required value={form.theater} onChange={(e) => set('theater', e.target.value)}><option value="">Select…</option>{(theaters.data || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field id="sh-s" label="Screen"><select id="sh-s" className="form-select" required value={form.screenName} onChange={(e) => set('screenName', e.target.value)} disabled={!form.theater}><option value="">Select…</option>{screens.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}</select></Field></div>
            <div className="col-md-4"><Field id="sh-d" label="Start (your local time)"><input id="sh-d" type="datetime-local" className="form-control" required value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field></div>
            <div className="col-6 col-md-4"><Field id="sh-p1" label="Standard price (₹)"><input id="sh-p1" type="number" min="0" max="10000" step="1" className="form-control" required value={form.standard} onChange={(e) => set('standard', e.target.value)} /></Field></div>
            <div className="col-6 col-md-4"><Field id="sh-p2" label="Premium price (₹)"><input id="sh-p2" type="number" min="0" max="10000" step="1" className="form-control" required value={form.premium} onChange={(e) => set('premium', e.target.value)} /></Field></div>
          </div>
          <div className="mt-3 d-flex gap-2"><button className="btn btn-accent btn-sm" disabled={busy || !form.movie || !form.theater || !form.screenName || !form.startsAt}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create show'}</button><button type="button" className="btn btn-outline-secondary btn-sm" onClick={closeForm} disabled={busy}>Cancel</button></div>
        </div></form>
      )}
      {shows.loading && <Loading />}
      {shows.error && <ErrorState error={shows.error} onRetry={shows.reload} />}
      {shows.data?.length === 0 && <EmptyState title="No upcoming shows"><p className="small">Create a show here, or extend the demo seed window to populate future showtimes.</p></EmptyState>}
      {shows.data?.length > 0 && (
        <div className="table-responsive"><table className="table table-sm align-middle"><thead><tr><th>Movie</th><th>Theater / screen</th><th>Starts</th><th>Seats left</th><th>Actions</th></tr></thead>
          <tbody>{shows.data.map((s) => (
            <tr key={s.id}><td>{s.movie.title}</td><td>{s.theater.name} · {s.screenName}</td><td>{fmtDateTime(s.startsAt)}</td><td>{s.availableSeats}</td>
              <td className="text-end text-nowrap"><button className="btn btn-outline-primary btn-sm me-2" onClick={() => openEdit(s)}>Edit</button><button className="btn btn-outline-danger btn-sm" onClick={() => remove(s)}>Delete</button></td></tr>
          ))}</tbody></table></div>
      )}
      <p className="small text-secondary">Shows with any booking history cannot be physically deleted. Only the next 100 upcoming shows are listed.</p>
    </>
  );
}
