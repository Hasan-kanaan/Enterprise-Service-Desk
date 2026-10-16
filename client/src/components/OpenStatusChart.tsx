const labels = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  WAITING_FOR_EMPLOYEE: 'Waiting for employee',
  BLOCKED: 'Blocked',
}
const colors = ['#6176d9', '#208a96', '#9873be', '#b78020', '#bf6268']

export function OpenStatusChart({ statuses }: { statuses: { status: string; count: number }[] }) {
  // Only presentation of server aggregates; never fetch or aggregate ticket records.
  const rows = Object.entries(labels).map(([status, label]) => ({ label, count: statuses.find(row => row.status === status)?.count ?? 0 }))
  const total = rows.reduce((sum, row) => sum + row.count, 0)
  const segments = rows.map((row, index) => {
    const start = rows.slice(0, index).reduce((sum, previous) => sum + previous.count, 0)
    return `${colors[index]} ${total ? start / total * 100 : 0}% ${total ? (start + row.count) / total * 100 : 0}%`
  })
  return <section className="panel analytics-section" aria-label="Open ticket status composition">
    <h2>Open ticket composition</h2>
    <div className="status-composition">
      <div className="status-donut" aria-hidden="true" style={{ background: total ? `conic-gradient(${segments.join(',')})` : 'var(--border)' }}>
        <div><strong>{total.toLocaleString()}</strong><span>open now</span></div>
      </div>
      <table className="status-legend">
        <caption className="sr-only">Current open tickets by status, exact count and percentage</caption>
        <thead><tr><th scope="col">Status</th><th scope="col">Count</th><th scope="col">Share</th></tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.label}>
          <th scope="row"><span className="status-swatch" aria-hidden="true" style={{ background: colors[index] }} />{row.label}</th>
          <td>{row.count.toLocaleString()}</td><td>{total ? `${(row.count / total * 100).toFixed(1)}%` : '—'}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!total && <p className="quiet-note">No open tickets. Percentages are not applicable.</p>}
  </section>
}
