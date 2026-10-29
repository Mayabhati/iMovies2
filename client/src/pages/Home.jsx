import { useTitle } from '../useTitle.js';
import { useEffect, useState } from 'react';
import { useApi } from '../useApi.js';
import MovieCard from '../components/MovieCard.jsx';
import { EmptyState, ErrorState, Loading } from '../components/State.jsx';

const TABS = [['all', 'All'], ['nowShowing', 'Now showing'], ['upcoming', 'Upcoming']];

export default function Home() {
  useTitle('Movies');
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('');
  const [status, setStatus] = useState('all');
  const [withShows, setWithShows] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => { const t = setTimeout(() => { setSearch(input.trim()); setPage(1); }, 300); return () => clearTimeout(t); }, [input]);

  const params = new URLSearchParams({ status, page, limit: 12 });
  if (search) params.set('search', search);
  if (genre) params.set('genre', genre);
  if (withShows) params.set('availability', 'withShows');
  const movies = useApi(`/movies?${params}`);
  const genres = useApi('/movies/genres');
  const filtered = search || genre || withShows || status !== 'all';
  const reset = () => { setInput(''); setSearch(''); setGenre(''); setStatus('all'); setWithShows(false); setPage(1); };

  return (
    <>
      <section className="hero rounded-4 p-4 p-md-5 mb-4">
        <h1 className="display-6 fw-bold mb-1">Movie ticket booking, made simple.</h1>
        <p className="text-secondary mb-0">Pick a movie, choose your seats, and reserve them in seconds.</p>
      </section>

      <form className="row g-2 align-items-end mb-3" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="col-12 col-md-5">
          <label htmlFor="q" className="form-label small text-secondary mb-1">Search by title</label>
          <input id="q" type="search" className="form-control" placeholder="e.g. Midnight Monsoon" value={input} onChange={(e) => setInput(e.target.value)} />
        </div>
        <div className="col-6 col-md-3">
          <label htmlFor="genre" className="form-label small text-secondary mb-1">Genre</label>
          <select id="genre" className="form-select" value={genre} onChange={(e) => { setGenre(e.target.value); setPage(1); }}>
            <option value="">All genres</option>
            {(genres.data || []).map((g) => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-4 pb-1">
          <div className="form-check">
            <input id="withShows" className="form-check-input" type="checkbox" checked={withShows} onChange={(e) => { setWithShows(e.target.checked); setPage(1); }} />
            <label htmlFor="withShows" className="form-check-label">Only movies with upcoming shows</label>
          </div>
        </div>
      </form>

      <div className="btn-group mb-4" role="group" aria-label="Release status">
        {TABS.map(([v, t]) => (
          <button key={v} type="button" className={`btn btn-sm ${status === v ? 'btn-accent' : 'btn-outline-secondary'}`} aria-pressed={status === v} onClick={() => { setStatus(v); setPage(1); }}>{t}</button>
        ))}
      </div>

      {movies.loading && <Loading label="Loading movies…" />}
      {movies.error && <ErrorState error={movies.error} onRetry={movies.reload} />}
      {!movies.loading && !movies.error && movies.data?.length === 0 && (
        <EmptyState title={filtered ? 'No movies match your filters' : 'No movies yet'}>
          {filtered && <button className="btn btn-outline-light btn-sm mt-2" onClick={reset}>Clear filters</button>}
        </EmptyState>
      )}
      {!movies.loading && !movies.error && movies.data?.length > 0 && (
        <>
          <div className="row row-cols-2 row-cols-md-3 row-cols-lg-4 g-3">
            {movies.data.map((m) => <div className="col" key={m.id}><MovieCard movie={m} /></div>)}
          </div>
          {movies.meta?.pages > 1 && (
            <nav className="d-flex justify-content-center align-items-center gap-3 mt-4" aria-label="Pagination">
              <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
              <span className="small text-secondary">Page {movies.meta.page} of {movies.meta.pages}</span>
              <button className="btn btn-outline-secondary btn-sm" disabled={page >= movies.meta.pages} onClick={() => setPage(page + 1)}>Next →</button>
            </nav>
          )}
        </>
      )}
    </>
  );
}
