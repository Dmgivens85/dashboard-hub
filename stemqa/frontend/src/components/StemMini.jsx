function StemMini({ currentTime, stem }) {
  const energyValue = stem.energy

  return (
    <div className="rounded-2xl border border-[var(--gray-border)] bg-white px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: stem.color }} />
          <span className="text-sm font-semibold text-[var(--text)]">{stem.label}</span>
        </div>
        <span className="text-[11px] uppercase tracking-[0.08em] text-[var(--text-sub)]">
          {energyValue == null ? 'Pending' : `${energyValue.toFixed(1)} dB`}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--gray-border)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${energyValue == null ? 0 : Math.min(Math.max((energyValue + 60) * 1.66, 6), 100)}%`,
            backgroundColor: stem.color,
          }}
        />
      </div>
      <div className="mt-2 text-xs text-[var(--text-sub)]">At {currentTime}</div>
    </div>
  )
}

export default StemMini
