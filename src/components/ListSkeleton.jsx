/**
 * Skeleton placeholder for list/table loading state.
 * rows: number of skeleton rows to show.
 */
export default function ListSkeleton({ rows = 6, columns = 4 }) {
  return (
    <div className="skeleton-list">
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, i) => (
                <th scope="col" key={i}><span className="skeleton skeleton--text" /></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, rowIdx) => (
              <tr key={rowIdx}>
                {Array.from({ length: columns }, (_, colIdx) => (
                  <td key={colIdx}><span className={`skeleton skeleton--${colIdx === columns - 1 ? 'short' : 'text'}`} /></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
