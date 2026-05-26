function FlagMarker({ duration, flag, onSelect, selected }) {
  const left = duration > 0 ? (flag.timestamp / duration) * 100 : 0
  const color =
    flag.state === 'acknowledged'
      ? 'var(--green)'
      : flag.state === 'escalated' || flag.state === 'manual_repair'
        ? 'var(--red)'
        : 'var(--amber)'

  return (
    <button
      className="absolute bottom-0 top-0 flex w-4 -translate-x-1/2 items-start justify-center bg-transparent"
      style={{ left: `${Math.min(Math.max(left, 1), 99)}%` }}
      title={`${flag.type}: ${flag.description}`}
      type="button"
      onClick={() => onSelect(flag.id)}
    >
      <span
        className={`mt-1 h-[26px] w-[10px] rounded-b-sm rounded-t-full border-2 border-white shadow-[0_8px_16px_rgba(0,0,0,0.18)] ${
          selected ? 'scale-110' : ''
        }`}
        style={{ backgroundColor: color }}
      />
    </button>
  )
}

export default FlagMarker
