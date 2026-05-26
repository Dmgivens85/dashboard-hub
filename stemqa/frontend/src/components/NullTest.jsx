function NullTest({ isOpen, isRunning, onClose, onRun, result, stemCount }) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(26,26,26,0.52)] p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-[var(--gray-border)] bg-white p-6 shadow-[0_32px_64px_rgba(0,0,0,0.22)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="rounded-full bg-[var(--pink-light)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pink)]">
              Null test
            </div>
            <h3 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">Source versus stem sum</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">
              Advisory only. The modal computes the brief’s residual score and prepares the null residual lane for visual inspection.
            </p>
          </div>
          <button className="ghost-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-[20px] bg-[var(--gray-light)] px-4 py-4">
            <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">Stem count</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{stemCount}</div>
          </div>
          <div className="rounded-[20px] bg-[var(--gray-light)] px-4 py-4">
            <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">Score</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{result ? `${result.score}%` : '—'}</div>
          </div>
          <div className="rounded-[20px] bg-[var(--gray-light)] px-4 py-4">
            <div className="text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">Residual status</div>
            <div className="mt-2 text-2xl font-semibold text-[var(--text)]">{result?.status ?? 'Pending'}</div>
          </div>
        </div>

        {result ? (
          <div className="mt-4 rounded-[20px] border border-[var(--gray-border)] bg-white px-4 py-4 text-sm text-[var(--text-sub)]">
            Residual path is now available in the workbench lane. Residual level: <span className="font-semibold text-[var(--text)]">{result.residual_dbfs} dBFS</span>
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button className="ghost-button" type="button" onClick={onClose}>
            Dismiss
          </button>
          <button className="pill-button" disabled={isRunning || stemCount === 0} type="button" onClick={onRun}>
            {isRunning ? 'Computing null test…' : 'Run null test'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default NullTest
