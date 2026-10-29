export const Pager = ({ meta, page, setPage }) => meta && meta.pages > 1 ? (
  <div className="d-flex justify-content-center align-items-center gap-3 my-3">
    <button className="btn btn-outline-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Previous</button>
    <span className="small text-secondary">Page {meta.page} of {meta.pages} ({meta.total} total)</span>
    <button className="btn btn-outline-secondary btn-sm" disabled={page >= meta.pages} onClick={() => setPage(page + 1)}>Next →</button>
  </div>
) : null;

export const Field = ({ id, label, children, help }) => (
  <div className="mb-2"><label htmlFor={id} className="form-label small mb-1">{label}</label>{children}{help && <div className="form-text">{help}</div>}</div>
);

export const FormAlert = ({ msg }) => msg ? <div className="alert alert-danger py-2" role="alert">{msg}</div> : null;
