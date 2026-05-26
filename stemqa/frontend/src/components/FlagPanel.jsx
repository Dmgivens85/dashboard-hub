import { useState } from 'react'
import { formatTimecode } from '../lib/format.js'
import StemMini from './StemMini.jsx'

function actionButtonTone(kind) {
  if (kind === 'primary') {
    return 'bg-[var(--pink)] text-white'
  }
  if (kind === 'danger') {
    return 'bg-[rgba(192,57,43,0.12)] text-[var(--red)]'
  }
  return 'bg-[var(--gray-light)] text-[var(--text)]'
}

function stateTone(state) {
  if (state === 'acknowledged') {
    return 'bg-[rgba(42,183,110,0.12)] text-[var(--green)]'
  }
  if (state === 'escalated' || state === 'manual_repair') {
    return 'bg-[rgba(192,57,43,0.12)] text-[var(--red)]'
  }
  return 'bg-[rgba(232,149,10,0.12)] text-[var(--amber)]'
}

function stateLabel(state) {
  if (state === 'acknowledged') {
    return 'Acknowledged'
  }
  if (state === 'manual_repair') {
    return 'Manual repair'
  }
  if (state === 'escalated') {
    return 'Escalated'
  }
  return 'Active'
}

function FlagPanel({
  activeTrackId,
  currentTime,
  flag,
  onAcknowledge,
  onEscalate,
  onLoopFlag,
  onManualRepair,
  onReassign,
  onToggleAB,
  stemTracks,
}) {
  const availableStemTracks = stemTracks.filter((track) => track.id && track.label)
  const [reassignChoice, setReassignChoice] = useState({ flagId: '', trackId: '' })
  const matchedTrack = availableStemTracks.find((track) => track.label === flag?.stem_name)
  const defaultTargetId =
    matchedTrack?.id ??
    availableStemTracks.find((track) => track.id === activeTrackId)?.id ??
    availableStemTracks[0]?.id ??
    ''
  const effectiveTargetId =
    reassignChoice.flagId === flag?.id &&
    availableStemTracks.some((track) => track.id === reassignChoice.trackId)
      ? reassignChoice.trackId
      : defaultTargetId

  const handleReassign = () => {
    if (!flag || !effectiveTargetId) {
      return
    }

    const nextTrack = availableStemTracks.find((track) => track.id === effectiveTargetId)
    if (nextTrack) {
      onReassign(flag.id, nextTrack)
    }
  }

  return (
    <section className="grid gap-5 rounded-[24px] border border-[var(--gray-border)] bg-white px-5 py-5 shadow-[0_20px_34px_rgba(0,0,0,0.05)] lg:grid-cols-[1.2fr_0.85fr]">
      <div>
        {flag ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${stateTone(flag.state)}`}>{flag.type}</span>
              <span className="font-mono text-sm text-[var(--pink)]">{formatTimecode(flag.timestamp)}</span>
              <span className="rounded-full bg-[var(--gray-light)] px-3 py-1 text-xs font-semibold text-[var(--text-sub)]">
                {stateLabel(flag.state)}
              </span>
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">{flag.title || flag.type}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-sub)]">{flag.description}</p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--text-sub)]">
              {flag.stem_name ? <span>Affected stem: {flag.stem_name}</span> : null}
              {flag.duration ? <span>Span: {flag.duration.toFixed(2)}s</span> : null}
              {flag.severity ? <span>Severity: {flag.severity}</span> : null}
            </div>
          </>
        ) : (
          <>
            <div className="rounded-full bg-[var(--pink-light)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--pink)]">
              Awaiting selection
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">Decision panel ready</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-sub)]">
              Select a marker on the flag track to review the issue, make an engineering decision, and clear export gating intentionally.
            </p>
          </>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${actionButtonTone('secondary')}`}
            disabled={!flag}
            type="button"
            onClick={onLoopFlag}
          >
            Loop region
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${actionButtonTone('secondary')}`}
            disabled={!flag}
            type="button"
            onClick={onToggleAB}
          >
            A/B source
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${actionButtonTone('primary')}`}
            disabled={!flag}
            type="button"
            onClick={onAcknowledge}
          >
            Acknowledge / proceed
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${actionButtonTone('secondary')}`}
            disabled={!flag}
            type="button"
            onClick={onManualRepair}
          >
            Stop / manual repair
          </button>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${actionButtonTone('danger')}`}
            disabled={!flag}
            type="button"
            onClick={onEscalate}
          >
            Escalate
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-[18px] bg-[var(--gray-light)] p-4 sm:flex-row sm:items-center">
          <select
            className="input-shell min-w-[210px]"
            disabled={!flag || availableStemTracks.length === 0}
            value={effectiveTargetId}
            onChange={(event) =>
              setReassignChoice({
                flagId: flag?.id ?? '',
                trackId: event.target.value,
              })
            }
          >
            {availableStemTracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.label}
              </option>
            ))}
          </select>
          <button
            className={`rounded-full px-4 py-2 text-sm font-semibold ${actionButtonTone('secondary')}`}
            disabled={!flag || availableStemTracks.length === 0}
            type="button"
            onClick={handleReassign}
          >
            Reassign to stem
          </button>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">Stem energy sidebar</h4>
          <span className="text-xs text-[var(--text-sub)]">Playhead {formatTimecode(flag?.timestamp ?? currentTime)}</span>
        </div>
        <div className="space-y-3">
          {stemTracks.map((stemTrack) => (
            <StemMini
              key={stemTrack.id}
              currentTime={formatTimecode(flag?.timestamp ?? currentTime)}
              stem={stemTrack}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

export default FlagPanel
