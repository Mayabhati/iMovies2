import { errorText } from '../format.js';

export const Loading = ({ label = 'Loading…' }) => (
  <div className="text-center py-5" role="status" aria-live="polite">
    <div className="spinner-border text-accent" aria-hidden="true" />
    <div className="mt-2 text-secondary">{label}</div>
  </div>
);

export const EmptyState = ({ title, children }) => (
  <div className="text-center py-5 text-secondary">
    <div className="fs-1" aria-hidden="true">🎞️</div>
    <h2 className="h5">{title}</h2>
    {children}
  </div>
);

export const ErrorState = ({ error, onRetry }) => (
  <div className="alert alert-danger d-flex flex-wrap align-items-center justify-content-between gap-2" role="alert">
    <span>{errorText(error)}</span>
    {onRetry && <button className="btn btn-sm btn-outline-light" onClick={onRetry}>Retry</button>}
  </div>
);
