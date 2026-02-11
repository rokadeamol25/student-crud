/** Skeleton for Dashboard (report cards + link cards) to avoid layout jump. */
export default function DashboardSkeleton() {
  return (
    <div className="dashboard">
      <h1 className="dashboard__title">Dashboard</h1>
      <p className="dashboard__subtitle skeleton skeleton--text" style={{ width: '12rem', height: '1.25rem' }} />
      <section className="dashboard__reports card page__section">
        <h2 className="card__heading">This month</h2>
        <div className="report-cards">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="report-card">
              <span className="skeleton skeleton--text" style={{ width: '60%', height: '0.875rem' }} />
              <span className="skeleton skeleton--text" style={{ width: '80%', height: '1.25rem' }} />
              <span className="skeleton skeleton--short" style={{ width: '4rem', height: '0.75rem' }} />
            </div>
          ))}
        </div>
        <p className="skeleton skeleton--text" style={{ width: '14rem', height: '1rem', marginTop: '0.75rem' }} />
      </section>
      <section className="dashboard__links">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="dashboard__card" style={{ pointerEvents: 'none' }}>
            <span className="skeleton skeleton--text" style={{ width: '40%', height: '1rem' }} />
            <span className="skeleton skeleton--text" style={{ width: '70%', height: '0.875rem' }} />
          </div>
        ))}
      </section>
    </div>
  );
}
