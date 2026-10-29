import { Link } from 'react-router-dom';
import Poster from './Poster.jsx';
import { duration } from '../format.js';

export default function MovieCard({ movie }) {
  const upcoming = new Date(movie.releaseDate) > new Date();
  return (
    <Link to={`/movies/${movie.id}`} className="movie-card text-decoration-none">
      <div className="position-relative">
        <Poster title={movie.title} url={movie.posterUrl} decorative />
        <span className="badge cert-badge">{movie.certificate}</span>
        {upcoming && <span className="badge bg-warning text-dark soon-badge">Upcoming</span>}
      </div>
      <div className="p-2">
        <h3 className="h6 mb-1 text-light text-truncate">{movie.title}</h3>
        <div className="small text-secondary text-truncate">{movie.genres.join(' • ')}</div>
        <div className="small text-secondary">{duration(movie.durationMinutes)} · {movie.language}</div>
      </div>
    </Link>
  );
}
