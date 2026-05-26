import { useEffect, useRef, useState } from 'react'
import FlagMarker from './FlagMarker.jsx'
import FlagPanel from './FlagPanel.jsx'
import NullTest from './NullTest.jsx'
import StepHeader from './StepHeader.jsx'
import WaveformLane from './WaveformLane.jsx'
import { formatTimecode } from '../lib/format.js'

function Workbench({
  canExport,
  exportLockedReason,
  flags,
  isExporting,
  isNullTestRunning,
  nullTest,
  nullTestOpen,
  onBack,
  onExport,
  onFlagReassign,
  onFlagStateChange,
  onNullTestClose,
  onNullTestOpen,
  onRunNullTest,
  residualTrack,
  separation,
  sourceTrack,
  stemTracks,
}) {
  const laneApisRef = useRef({})
  const [laneVersion, setLaneVersion] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [abMode, setAbMode] = useState(false)
  const [loopWindow, setLoopWindow] = useState(null)
  const [playbackMode, setPlaybackMode] = useState('Interrupt on flag')
  const [selectedTrackId, setSelectedTrackId] = useState(stemTracks[0]?.id ?? 'source')
  const [selectedFlagId, setSelectedFlagId] = useState(flags[0]?.id ?? '')

  const visibleTracks = [sourceTrack, ...stemTracks, residualTrack]
  const visibleTrackIds = visibleTracks.map((track) => track.id)
  const effectiveSelectedFlagId = flags.some((flag) => flag.id === selectedFlagId) ? selectedFlagId : flags[0]?.id ?? ''
  const activeFlag = flags.find((flag) => flag.id === effectiveSelectedFlagId)
  const flaggedTrackId = stemTracks.find((track) => track.label === activeFlag?.stem_name)?.id
  const effectiveSelectedTrackId = flaggedTrackId
    ? flaggedTrackId
    : visibleTrackIds.includes(selectedTrackId)
      ? selectedTrackId
      : stemTracks[0]?.id ?? 'source'
  const unresolvedFlags = flags.filter((flag) => (flag.state ?? 'active') === 'active')
  const acknowledgedFlags = flags.filter((flag) => flag.state === 'acknowledged')
  const escalatedFlags = flags.filter((flag) => flag.state === 'escalated')
  const manualRepairFlags = flags.filter((flag) => flag.state === 'manual_repair')
  const errorDetail = separation.error_detail || separation.errorDetail || separation.error || ''
  const logsUrl = separation.logs_url || separation.logsUrl || ''

  const jumpToTime = (time) => {
    const nextTime = Math.max(time, 0)
    setCurrentTime(nextTime)
    Object.values(laneApisRef.current).forEach((laneApi) => {
      laneApi.setTime?.(nextTime)
    })
  }

  const handleFlagSelect = (flagId) => {
    const nextFlag = flags.find((flag) => flag.id === flagId)
    setSelectedFlagId(flagId)
    if (nextFlag) {
      jumpToTime(Math.max(nextFlag.timestamp - 0.15, 0))
    }
  }

  const handleLoopFlag = () => {
    if (!activeFlag) {
      return
    }

    const start = Math.max(activeFlag.timestamp - 0.35, 0)
    const windowDuration = activeFlag.duration ? Math.min(Math.max(activeFlag.duration, 1.25), 4) : 2
    setLoopWindow({ start, end: start + windowDuration })
    jumpToTime(start)
    setPlaying(true)
  }

  const handleToggleAB = () => {
    if (activeFlag) {
      jumpToTime(Math.max(activeFlag.timestamp - 0.1, 0))
    }
    setAbMode((value) => !value)
  }

  const handleApiChange = (trackId, api) => {
    if (api) {
      laneApisRef.current[trackId] = api
    } else {
      delete laneApisRef.current[trackId]
    }
    setLaneVersion((version) => version + 1)
  }

  useEffect(() => {
    const laneApis = Object.values(laneApisRef.current)
    if (laneApis.length === 0) {
      return
    }

    laneApis.forEach((laneApi) => {
      if (playing) {
        laneApi.play()
      } else {
        laneApi.pause()
      }
    })
  }, [laneVersion, playing])

  const energyByLabel = new Map((activeFlag?.stem_energies ?? []).map((entry) => [entry.label, entry]))
  const stemTracksWithEnergy = stemTracks.map((track) => ({
    ...track,
    energy: energyByLabel.get(track.label)?.energy ?? track.energy ?? null,
  }))

  const handleTimeUpdate = (time) => {
    if (playing && loopWindow && time >= loopWindow.end) {
      jumpToTime(loopWindow.start)
      return
    }
    setCurrentTime(time)
  }

  return (
    <div className="mx-auto max-w-[1650px]">
      <StepHeader
        activeStep={3}
        title="QA workbench"
        subtitle="Review flagged artifacts in context, resolve each engineering decision explicitly, and unlock export only when no flags remain active."
        aside={
          <div className="rounded-2xl border border-[var(--gray-border)] bg-white px-4 py-3 text-sm">
            <div className="font-semibold text-[var(--text)]">Job status</div>
            <div className="mt-1 text-[var(--text-sub)]">
              {separation.status === 'processing' || separation.status === 'queued'
                ? `Separation in progress · ${Math.round(separation.progress * 100)}%`
                : separation.status === 'complete'
                  ? 'Separation complete'
                  : separation.status === 'failed'
                    ? 'Separation failed'
                    : 'Awaiting separation'}
            </div>
          </div>
        }
      />

      {separation.status === 'failed' ? (
        <div className="mb-5 rounded-[22px] border border-[var(--pink)] bg-[var(--pink-light)] px-5 py-4">
          <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--pink)]">Separation failure</div>
          <div className="mt-2 text-sm leading-6 text-[var(--text)]">
            {errorDetail || 'Separation failed before the workbench could load the separated stems.'}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="ghost-button !px-4 !py-2" type="button" onClick={onBack}>
              Back to model
            </button>
            {logsUrl ? (
              <a
                className="pill-button !px-4 !py-2 no-underline"
                href={logsUrl}
                rel="noreferrer"
                target="_blank"
              >
                View logs
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="rounded-[26px] border border-[var(--gray-border)] bg-white p-4 shadow-[0_22px_44px_rgba(0,0,0,0.06)]">
        <div className="mb-4 flex flex-col gap-4 border-b border-[var(--gray-border)] pb-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-[var(--pink-light)] px-4 py-2 font-mono text-sm font-semibold text-[var(--pink)]">
              {formatTimecode(currentTime)}
            </div>
            <button className="pill-button !px-4 !py-2" type="button" onClick={() => setPlaying((value) => !value)}>
              {playing ? 'Pause' : 'Play'}
            </button>
            <button
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                abMode ? 'bg-[var(--pink)] text-white' : 'bg-[var(--gray-light)] text-[var(--text)]'
              }`}
              type="button"
              onClick={handleToggleAB}
            >
              A/B source
            </button>
            <button className="ghost-button !px-4 !py-2" type="button" onClick={onNullTestOpen}>
              Null mix
            </button>
            <select
              className="input-shell max-w-[220px]"
              value={playbackMode}
              onChange={(event) => setPlaybackMode(event.target.value)}
            >
              <option>Interrupt on flag</option>
              <option>Continuous</option>
              <option>Flag-only</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                nullTest.result
                  ? nullTest.result.score >= 97
                    ? 'bg-[rgba(42,183,110,0.12)] text-[var(--green)]'
                    : 'bg-[rgba(232,149,10,0.12)] text-[var(--amber)]'
                  : 'bg-[var(--gray-light)] text-[var(--text-sub)]'
              }`}
            >
              Health score {nullTest.result ? `${nullTest.result.score}%` : 'Pending'}
            </span>
            <span className="text-sm text-[var(--text-sub)]">
              {unresolvedFlags.length} unresolved · {acknowledgedFlags.length} ack · {manualRepairFlags.length} manual ·{' '}
              {escalatedFlags.length} escalated
            </span>
            <button
              className="pill-button !px-4 !py-2"
              disabled={!canExport || isExporting}
              title={canExport ? 'Export approved stems.' : exportLockedReason}
              type="button"
              onClick={onExport}
            >
              {isExporting ? 'Exporting...' : canExport ? 'Export stems' : 'Export locked'}
            </button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[108px_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="h-[18px]" />
            <div className="flex h-[34px] items-center rounded-[14px] bg-[var(--gray-light)] px-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">
              Flags
            </div>
            {visibleTracks.map((track) => (
              <button
                key={track.id}
                className={`flex h-[50px] w-full items-center rounded-[14px] px-3 text-left text-sm font-semibold transition ${
                  effectiveSelectedTrackId === track.id
                    ? 'bg-[var(--pink-light)] text-[var(--pink)]'
                    : 'bg-[var(--gray-light)] text-[var(--text-sub)]'
                }`}
                type="button"
                onClick={() => setSelectedTrackId(track.id)}
              >
                {track.label}
              </button>
            ))}
          </div>

          <div className="space-y-3 overflow-hidden">
            <div className="flex h-[18px] items-center rounded-full bg-[var(--gray-light)] px-4 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">
              Timeline
            </div>

            <div className="relative h-[34px] overflow-hidden rounded-[14px] border border-[var(--gray-border)] bg-[linear-gradient(90deg,#fff,#fafafa)]">
              {flags.length > 0 ? (
                flags.map((flag) => (
                  <FlagMarker
                    key={flag.id}
                    duration={duration}
                    flag={flag}
                    selected={flag.id === effectiveSelectedFlagId}
                    onSelect={handleFlagSelect}
                  />
                ))
              ) : (
                <div className="flex h-full items-center px-4 text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">
                  Flag markers will render here after separation analysis completes.
                </div>
              )}
              <div
                className="absolute bottom-0 top-0 w-[2px] bg-[var(--pink)] shadow-[0_0_0_1px_rgba(232,32,118,0.12)]"
                style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
              />
            </div>

            {visibleTracks.map((track, index) => {
              const isPrimary = index === 0
              const isMuted = abMode ? track.id !== 'source' : track.id === 'source' || track.id === 'null-residual'

              return (
                <div key={track.id} className="relative h-[50px]">
                  <WaveformLane
                    audioUrl={track.audioUrl}
                    backgroundColor={track.backgroundColor}
                    color={track.color}
                    height={50}
                    isPrimary={isPrimary}
                    isSelected={effectiveSelectedTrackId === track.id}
                    muted={isMuted}
                    onApiChange={handleApiChange}
                    onDuration={setDuration}
                    onSeek={setCurrentTime}
                    onTimeUpdate={handleTimeUpdate}
                    playing={playing}
                    trackId={track.id}
                    syncTime={currentTime}
                  />
                  <div
                    className="pointer-events-none absolute bottom-0 top-0 w-[2px] bg-[var(--pink)]"
                    style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-[var(--gray-light)] px-4 py-3 text-sm text-[var(--text-sub)]">
          <span>{exportLockedReason}</span>
          <button className="ghost-button !px-4 !py-2" type="button" onClick={onBack}>
            Back to model
          </button>
        </div>
      </div>

      <div className="mt-6">
        <FlagPanel
          activeTrackId={effectiveSelectedTrackId}
          currentTime={currentTime}
          flag={activeFlag}
          onAcknowledge={() => activeFlag && onFlagStateChange(activeFlag.id, 'acknowledged')}
          onEscalate={() => activeFlag && onFlagStateChange(activeFlag.id, 'escalated')}
          onLoopFlag={handleLoopFlag}
          onManualRepair={() => activeFlag && onFlagStateChange(activeFlag.id, 'manual_repair')}
          onReassign={onFlagReassign}
          onToggleAB={handleToggleAB}
          stemTracks={stemTracksWithEnergy}
        />
      </div>

      <NullTest
        isOpen={nullTestOpen}
        isRunning={isNullTestRunning}
        onClose={onNullTestClose}
        onRun={onRunNullTest}
        result={nullTest.result}
        stemCount={stemTracks.filter((track) => track.audioUrl).length}
      />
    </div>
  )
}

export default Workbench
