/** Skeleton for invoices list (cards + table layout). */
export default function InvoiceListSkeleton() {
  return (
    <div className="skeleton-list">
      <div className="invoice-list-cards">
        {[1, 2, 3].map((i) => (
          <div key={i} className="invoice-card skeleton-card">
            <div className="skeleton skeleton--text" style={{ width: '60%' }} />
            <div className="skeleton skeleton--text" style={{ width: '40%' }} />
            <div className="skeleton skeleton--short" style={{ width: '4rem' }} />
            <div className="skeleton skeleton--text" style={{ width: '50%' }} />
          </div>
        ))}
      </div>
      <div className="invoice-list-table-wrap">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col"><span className="skeleton skeleton--text" /></th>
                <th scope="col"><span className="skeleton skeleton--text" /></th>
                <th scope="col"><span className="skeleton skeleton--text" /></th>
                <th scope="col"><span className="skeleton skeleton--text" /></th>
                <th scope="col"><span className="skeleton skeleton--short" /></th>
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5].map((i) => (
                <tr key={i}>
                  <td><span className="skeleton skeleton--text" /></td>
                  <td><span className="skeleton skeleton--text" /></td>
                  <td><span className="skeleton skeleton--short" /></td>
                  <td><span className="skeleton skeleton--text" /></td>
                  <td><span className="skeleton skeleton--short" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
