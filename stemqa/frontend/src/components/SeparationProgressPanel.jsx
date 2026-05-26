import { useEffect, useState } from 'react'
import { formatDuration } from '../lib/format.js'

function statusLabel(status) {
  if (status === 'complete') {
    return 'Separation complete'
  }
  if (status === 'failed') {
    return 'Separation failed'
  }
  if (status === 'starting') {
    return 'Starting separation'
  }
  if (status === 'queued') {
    return 'Queued'
  }
  return 'Separating'
}

function statusTone(status) {
  if (status === 'complete') {
    return 'bg-[rgba(42,183,110,0.12)] text-[var(--green)]'
  }
  if (status === 'failed') {
    return 'bg-[rgba(192,57,43,0.12)] text-[var(--red)]'
  }
  return 'bg-[var(--pink-light)] text-[var(--pink)]'
}

function SeparationProgressPanel({
  errorDetail,
  estimatedRuntimeSeconds,
  isOpen,
  jobId,
  logTail,
  logsUrl,
  modelName,
  onGoToWorkbench,
  onTryAgain,
  progress,
  startedAt,
  status,
}) {
  const [clock, setClock] = useState(() => Date.now())

  useEffect(() => {
    if (!isOpen || !startedAt) {
      return undefined
    }

    const intervalId = window.setInterval(() => {
      setClock(Date.now())
    }, 1000)
    return () => window.clearInterval(intervalId)
  }, [isOpen, startedAt])

  if (!isOpen) {
    return null
  }

  const elapsedSeconds = startedAt ? Math.max((clock - new Date(startedAt).getTime()) / 1000, 0) : 0

  const normalizedProgress = status === 'complete' ? 1 : Math.max(progress || 0, 0)
  const remainingSeconds =
    typeof estimatedRuntimeSeconds === 'number'
      ? Math.max(Math.round(estimatedRuntimeSeconds - elapsedSeconds), 0)
      : null
  const showIndeterminate = ['starting', 'queued'].includes(status) || normalizedProgress <= 0
  const logLines = logTail?.length ? logTail : ['Waiting for live job logs…']

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-4 sm:px-6 lg:px-10">
      <div className="slide-up-panel pointer-events-auto mx-auto max-w-[1500px] rounded-[26px] border border-[var(--gray-border)] bg-white p-5 shadow-[0_-18px_42px_rgba(0,0,0,0.14)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${statusTone(status)}`}>
              {statusLabel(status)}
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">
              {status === 'failed' ? 'Separation attempt needs review' : modelName || 'Separation job'}
            </h3>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-[var(--text-sub)]">
              <span>Job ID: {jobId || 'Pending assignment'}</span>
              <span>Model: {modelName || 'Pending'}</span>
              <span>Elapsed: {formatDuration(elapsedSeconds)}</span>
              <span>ETA: {remainingSeconds === null ? 'Calculating…' : formatDuration(remainingSeconds)}</span>
            </div>
          </div>

          {status === 'complete' ? (
            <button className="pill-button !px-4 !py-2" type="button" onClick={onGoToWorkbench}>
              Go to workbench
            </button>
          ) : null}

          {status === 'failed' ? (
            <div className="flex flex-wrap gap-3">
              <button className="ghost-button !px-4 !py-2" type="button" onClick={onTryAgain}>
                Try again
              </button>
              {logsUrl ? (
                <a className="pill-button !px-4 !py-2 no-underline" href={logsUrl} rel="noreferrer" target="_blank">
                  View logs
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="mt-4 h-[8px] overflow-hidden rounded-full bg-[rgba(232,32,118,0.12)]">
          {showIndeterminate ? (
            <div className="upload-progress-indeterminate h-full bg-[var(--pink)]" />
          ) : (
            <div
              className={`h-full transition-[width] duration-500 ${status === 'complete' ? 'bg-[var(--green)]' : 'bg-[var(--pink)]'}`}
              style={{ width: `${Math.max(normalizedProgress * 100, 8)}%` }}
            />
          )}
        </div>

        {status === 'failed' && errorDetail ? (
          <div className="mt-4 rounded-[18px] border border-[var(--pink)] bg-[var(--pink-light)] px-4 py-3 text-sm text-[var(--text)]">
            {errorDetail}
          </div>
        ) : null}

        <div className="mt-4 rounded-[20px] border border-[var(--gray-border)] bg-[var(--gray-light)] p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">Live log tail</div>
          <div className="max-h-44 overflow-y-auto rounded-[16px] bg-[#101418] px-4 py-3 font-mono text-xs leading-6 text-[#d7e2ea]">
            {logLines.map((line, index) => (
              <div key={`${index}-${line}`}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default SeparationProgressPanel
