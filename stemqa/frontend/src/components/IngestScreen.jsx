import { STEM_TYPES } from '../lib/constants.js'
import { formatDuration, formatFileSize, formatPercent } from '../lib/format.js'
import NamingPreview from './NamingPreview.jsx'
import StepHeader from './StepHeader.jsx'

function statusTone(status) {
  if (status === 'pass') {
    return 'bg-[var(--green)]'
  }
  if (status === 'warn') {
    return 'bg-[var(--amber)]'
  }
  if (status === 'fail') {
    return 'bg-[var(--red)]'
  }
  return 'bg-[var(--gray)]'
}

function sourceBadgeTone(sourceBadge) {
  if (sourceBadge === 'score') {
    return 'bg-[var(--pink)] text-white'
  }
  if (sourceBadge === 'manual') {
    return 'bg-[rgba(232,149,10,0.14)] text-[var(--amber)]'
  }
  if (sourceBadge === 'detected') {
    return 'bg-[rgba(79,143,247,0.14)] text-[#4F8FF7]'
  }
  if (sourceBadge === 'conflict') {
    return 'bg-[rgba(192,57,43,0.14)] text-[var(--red)]'
  }
  return 'bg-[var(--gray-light)] text-[var(--text-sub)]'
}

function FileDropZone({ accept, description, fileName, label, onSelect }) {
  return (
    <label className="block cursor-pointer rounded-[18px] border border-dashed border-[var(--pink-border)] bg-[linear-gradient(180deg,#fff,var(--pink-light))] px-4 py-5 transition hover:border-[var(--pink)] hover:shadow-[0_12px_24px_rgba(232,32,118,0.12)]">
      <span className="mb-1 block text-sm font-semibold text-[var(--text)]">{label}</span>
      <span className="block text-sm text-[var(--text-sub)]">{description}</span>
      <span className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--text-sub)]">
        <span className="rounded-full bg-white px-3 py-1 ring-1 ring-[var(--pink-border)]">{accept}</span>
        <span className="max-w-[130px] truncate text-right font-semibold text-[var(--pink)]">
          {fileName || 'Choose file'}
        </span>
      </span>
      <input
        className="sr-only"
        type="file"
        accept={accept}
        onChange={(event) => {
          const nextFile = event.target.files?.[0]
          if (nextFile) {
            onSelect(nextFile)
          }
        }}
      />
    </label>
  )
}

function IngestScreen({
  audio,
  blockingReason,
  canProceed,
  checks,
  draftNotice,
  error,
  isSubmitting,
  namingPreview,
  onAddStem,
  onAudioSelected,
  onConflictAcknowledged,
  onMetaChange,
  onProceed,
  onSaveDraft,
  onScoreSelected,
  onStemChange,
  onStemDelete,
  onWarningAcknowledged,
  score,
  scoreFileName,
  sessionMeta,
  sourceFileName,
  sourceType,
  stems,
  warningsAcknowledged,
}) {
  const warningCount = checks.filter((check) => check.status === 'warn').length

  return (
    <div className="mx-auto max-w-[1600px]">
      <StepHeader
        activeStep={1}
        title="Source ingest and session prep"
        subtitle="Validate the source asset, inspect ingest health, and prepare the working stem list before model selection."
        aside={
          <div className="rounded-2xl border border-[var(--pink-border)] bg-[var(--pink-light)] px-4 py-3 text-sm">
            <div className="font-semibold text-[var(--pink)]">Validation state</div>
            <div className="mt-1 text-[var(--text-sub)]">
              {isSubmitting ? 'Running ingest checks…' : canProceed ? 'Ready for model configuration.' : 'Awaiting ingest clearance.'}
            </div>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[210px_minmax(0,1fr)_360px]">
        <aside className="space-y-4">
          <FileDropZone
            accept=".wav,.flac,audio/wav,audio/flac"
            description="Lossless source only. WAV and FLAC are accepted."
            fileName={sourceFileName}
            label="Source file"
            onSelect={onAudioSelected}
          />
          <FileDropZone
            accept=".sib,.xml,.musicxml"
            description="Optional score import for instrument and bar mapping."
            fileName={scoreFileName}
            label="Sibelius or MusicXML"
            onSelect={onScoreSelected}
          />

          <section className="panel-shell">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Session metadata</h3>
              <p className="text-sm text-[var(--text-sub)]">These values drive naming preview and export metadata.</p>
            </div>
            <div className="space-y-3">
              {[
                ['catalog_id', 'Catalog ID', 'TMPL-0001'],
                ['composer', 'Composer', 'Everly Brothers'],
                ['title', 'Title', 'All I Have To Do Is Dream'],
                ['session_name', 'Session name', 'stemqa-everly'],
              ].map(([field, label, placeholder]) => (
                <label key={field} className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">
                    {label}
                  </span>
                  <input
                    className="input-shell"
                    placeholder={placeholder}
                    type="text"
                    value={sessionMeta[field]}
                    onChange={(event) => onMetaChange(field, event.target.value)}
                  />
                </label>
              ))}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">
                  Version
                </span>
                <input
                  className="input-shell"
                  min="1"
                  type="number"
                  value={sessionMeta.version}
                  onChange={(event) => onMetaChange('version', Number(event.target.value) || 1)}
                />
              </label>
            </div>
          </section>
        </aside>

        <main className="space-y-6">
          <section className="panel-shell">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">Ingest checks</h3>
                <p className="text-sm text-[var(--text-sub)]">
                  Hard rejects stop the flow. Soft warnings require acknowledgement before model configuration.
                </p>
              </div>
              {audio ? (
                <div className="grid gap-2 text-sm text-[var(--text-sub)] sm:grid-cols-2">
                  <div className="rounded-2xl bg-[var(--gray-light)] px-3 py-2">
                    <span className="font-semibold text-[var(--text)]">{audio.sample_rate}</span> Hz
                  </div>
                  <div className="rounded-2xl bg-[var(--gray-light)] px-3 py-2">
                    <span className="font-semibold text-[var(--text)]">{audio.bit_depth ?? '—'}</span> bit
                  </div>
                  <div className="rounded-2xl bg-[var(--gray-light)] px-3 py-2">
                    <span className="font-semibold text-[var(--text)]">{formatDuration(audio.duration)}</span>
                  </div>
                  <div className="rounded-2xl bg-[var(--gray-light)] px-3 py-2">
                    <span className="font-semibold text-[var(--text)]">{formatFileSize(audio.file_size)}</span>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="table-shell">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--gray-border)] bg-[var(--gray-light)] text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">
                  <tr>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Label</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.length > 0 ? (
                    checks.map((check) => (
                      <tr key={check.label} className="border-b border-[var(--gray-border)] last:border-b-0">
                        <td className="px-4 py-3">
                          <span className={`inline-flex h-3.5 w-3.5 rounded-full ${statusTone(check.status)}`} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--text)]">{check.label}</td>
                        <td className="px-4 py-3 text-[var(--text)]">{check.value}</td>
                        <td className="px-4 py-3 text-[var(--text-sub)]">{check.note || '—'}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td className="px-4 py-6 text-[var(--text-sub)]" colSpan="4">
                        Upload a source file to populate the ingest report.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel-shell">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">Stem configuration</h3>
                <p className="text-sm text-[var(--text-sub)]">
                  Score data takes priority. Manual edits are marked as conflicts until acknowledged.
                </p>
              </div>
              <button className="ghost-button" type="button" onClick={onAddStem}>
                Add stem
              </button>
            </div>

            <div className="table-shell">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--gray-border)] bg-[var(--gray-light)] text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">
                  <tr>
                    <th className="px-4 py-3">Color</th>
                    <th className="px-4 py-3">Instrument</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Confidence</th>
                    <th className="px-4 py-3">Stem type</th>
                    <th className="px-4 py-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {stems.map((stem) => (
                    <tr key={stem.id} className="border-b border-[var(--gray-border)] last:border-b-0">
                      <td className="px-4 py-3">
                        <span className="inline-flex h-4 w-4 rounded-full ring-2 ring-white" style={{ backgroundColor: stem.color }} />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          className="input-shell"
                          type="text"
                          value={stem.instrument}
                          onChange={(event) => onStemChange(stem.id, 'instrument', event.target.value)}
                        />
                        {stem.source_badge === 'conflict' ? (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-[rgba(192,57,43,0.12)] px-3 py-1 text-xs font-semibold text-[var(--red)]">
                              Conflict
                            </span>
                            {!stem.conflictAcknowledged ? (
                              <button
                                className="rounded-full bg-[var(--red)] px-3 py-1 text-xs font-semibold text-white"
                                type="button"
                                onClick={() => onConflictAcknowledged(stem.id)}
                              >
                                Acknowledge override
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--text-sub)]">Override acknowledged</span>
                            )}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${sourceBadgeTone(stem.source_badge)}`}>
                          {stem.source_badge}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-2.5 w-28 overflow-hidden rounded-full bg-[var(--gray-border)]">
                            <div
                              className="h-full rounded-full bg-[linear-gradient(90deg,var(--pink),#ff8bbd)]"
                              style={{ width: `${Math.max(stem.detection_confidence * 100, 8)}%` }}
                            />
                          </div>
                          <span className="text-xs font-semibold text-[var(--text-sub)]">
                            {formatPercent(stem.detection_confidence, 0)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          className="input-shell"
                          value={stem.stem_type}
                          onChange={(event) => onStemChange(stem.id, 'stem_type', event.target.value)}
                        >
                          {STEM_TYPES.map((stemType) => (
                            <option key={stemType} value={stemType}>
                              {stemType}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-sm font-semibold text-[var(--red)]" type="button" onClick={() => onStemDelete(stem.id)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="panel-shell">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text)]">Source summary</h3>
                <p className="text-sm text-[var(--text-sub)]">Quick metadata and score state.</p>
              </div>
              <span className="rounded-full bg-[var(--gray-light)] px-3 py-1 text-xs font-semibold text-[var(--text-sub)]">
                {sourceType}
              </span>
            </div>
            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-2xl bg-[var(--gray-light)] px-4 py-3">
                <div className="font-semibold text-[var(--text)]">Audio</div>
                <div className="mt-1 text-[var(--text-sub)]">{sourceFileName || 'No source uploaded yet.'}</div>
              </div>
              <div className="rounded-2xl bg-[var(--gray-light)] px-4 py-3">
                <div className="font-semibold text-[var(--text)]">Score</div>
                <div className="mt-1 text-[var(--text-sub)]">
                  {score?.status === 'parsed'
                    ? `${score.part_count} parts · ${score.bar_count} bars`
                    : score?.message || 'No score uploaded.'}
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--gray-light)] px-4 py-3">
                <div className="font-semibold text-[var(--text)]">Checks raised</div>
                <div className="mt-1 text-[var(--text-sub)]">{warningCount} warnings requiring review.</div>
              </div>
            </div>

            {audio?.soft_flags?.length ? (
              <label className="mt-4 flex items-start gap-3 rounded-2xl border border-[rgba(232,149,10,0.26)] bg-[rgba(232,149,10,0.08)] px-4 py-3 text-sm">
                <input
                  checked={warningsAcknowledged}
                  className="mt-1"
                  type="checkbox"
                  onChange={(event) => onWarningAcknowledged(event.target.checked)}
                />
                <span>
                  I acknowledge the ingest warnings ({audio.soft_flags.join(', ')}) and want to continue with model setup.
                </span>
              </label>
            ) : null}
          </section>

          <NamingPreview names={namingPreview} />

          {error ? <div className="rounded-2xl border border-[rgba(192,57,43,0.3)] bg-[rgba(192,57,43,0.08)] px-4 py-3 text-sm text-[var(--red)]">{error}</div> : null}
          {draftNotice ? <div className="rounded-2xl bg-[var(--gray-light)] px-4 py-3 text-sm text-[var(--text-sub)]">{draftNotice}</div> : null}

          <div className="rounded-[22px] border border-[var(--gray-border)] bg-white px-4 py-4 shadow-[0_14px_28px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col gap-3">
              <button className="ghost-button" type="button" onClick={onSaveDraft}>
                Save draft
              </button>
              <button className="pill-button" disabled={!canProceed} type="button" onClick={onProceed}>
                Configure model
              </button>
              {!canProceed ? <p className="text-sm text-[var(--text-sub)]">{blockingReason}</p> : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default IngestScreen
