import { MODEL_OPTIONS } from '../lib/constants.js'
import { formatDuration } from '../lib/format.js'
import StepHeader from './StepHeader.jsx'

function estimateRuntime(duration, modelLabel, overlap, shifts) {
  const selectedModel = MODEL_OPTIONS.find((option) => option.label === modelLabel) ?? MODEL_OPTIONS[0]
  const overlapFactor = 1 + (overlap - 8) * 0.035
  const shiftFactor = shifts === 0 ? 0.9 : shifts === 2 ? 1 : 1.18
  return Math.max(30, duration * selectedModel.runtimeFactor * overlapFactor * shiftFactor)
}

function stemStatusLabel(stem) {
  if (stem.source_badge === 'score') {
    return 'Score mapped'
  }
  if (stem.source_badge === 'expected') {
    return 'Expected output'
  }
  if (stem.source_badge === 'conflict') {
    return 'Override pending'
  }
  if (stem.source_badge === 'manual') {
    return 'Manual label'
  }
  return 'Configured'
}

function recommendationCopy(sourceType) {
  if (sourceType === 'Orchestral/Classical') {
    return 'HTDemucs FT recommended for orchestral material — optimized for transient integrity and balanced artifact control.'
  }
  if (sourceType === 'Pop/Rock/Vocal') {
    return 'Ensemble suggested for pop, rock, and vocal-forward material — useful for dense arrangements that benefit from averaged separation output.'
  }
  return ''
}

function recommendedBadge(sourceType, optionLabel) {
  if (sourceType === 'Pop/Rock/Vocal') {
    return optionLabel === 'Ensemble' ? 'Suggested' : ''
  }
  if (optionLabel === 'HTDemucs FT') {
    return 'Recommended'
  }
  return ''
}

function ModelScreen({
  duration,
  error,
  isSubmitting,
  model,
  notice,
  onBack,
  onModelChange,
  onRunSeparation,
  onStemToggle,
  sourceType,
  stems,
}) {
  const estimatedRuntime = estimateRuntime(duration, model.selected, model.overlap, model.shifts)
  const selectedStemCount = stems.filter((stem) => model.selectedStemIds.includes(stem.id)).length
  const recommendation = recommendationCopy(sourceType)

  return (
    <div className="mx-auto max-w-[1500px]">
      <StepHeader
        activeStep={2}
        title="Model configuration"
        subtitle="Choose the separation engine, shape the overlap and shift passes, and decide which stems should be prepared for the QA workbench."
        aside={
          <div className="rounded-2xl border border-[var(--pink-border)] bg-[var(--pink-light)] px-4 py-3 text-sm">
            <div className="font-semibold text-[var(--pink)]">Output locked</div>
            <div className="mt-1 text-[var(--text-sub)]">32-bit float WAV, unnormalized, identical source bounds.</div>
          </div>
        }
      />

      {recommendation ? (
        <div className="mb-6 rounded-[20px] border border-[var(--pink-border)] bg-[var(--pink-light)] px-4 py-4 text-sm">
          <div className="font-semibold text-[var(--pink)]">Model recommendation</div>
          <div className="mt-1 text-[var(--text)]">{recommendation}</div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <main className="space-y-6">
          <section className="panel-shell">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Model selector</h3>
              <p className="text-sm text-[var(--text-sub)]">
                HTDemucs FT is the default. Ensemble reflects avg_wave blending across both approved backends.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {MODEL_OPTIONS.map((option) => {
                const isSelected = model.selected === option.label
                const badgeLabel = recommendedBadge(sourceType, option.label)
                return (
                  <button
                    key={option.label}
                    className={`rounded-[20px] border px-5 py-5 text-left transition ${
                      isSelected
                        ? 'border-[var(--pink)] bg-[linear-gradient(180deg,var(--pink-light),#fff)] shadow-[0_18px_32px_rgba(232,32,118,0.16)]'
                        : option.specialized
                          ? 'border-[rgba(155,155,155,0.38)] bg-[linear-gradient(180deg,#fafafa,#f2f2f2)] hover:border-[rgba(232,149,10,0.4)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.04)]'
                          : 'border-[var(--gray-border)] bg-white hover:border-[var(--pink-border)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.04)]'
                    } ${option.disabled ? 'cursor-not-allowed opacity-75' : ''} ${option.specialized ? 'saturate-[0.68]' : ''}`}
                    disabled={option.disabled}
                    type="button"
                    onClick={() => onModelChange('selected', option.label)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg font-semibold text-[var(--text)]">{option.label}</span>
                          {badgeLabel ? (
                            <span className="rounded-full bg-[var(--pink)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
                              {badgeLabel}
                            </span>
                          ) : null}
                          {option.warningBadge ? (
                            <span className="rounded-full bg-[rgba(232,149,10,0.14)] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--amber)]">
                              {option.warningBadge}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-sub)]">{option.detail}</p>
                        {option.warningCopy ? (
                          <p className="mt-2 text-xs leading-5 text-[var(--text-sub)]">{option.warningCopy}</p>
                        ) : null}
                      </div>
                      <span
                        className={`mt-1 inline-flex h-4 w-4 rounded-full border ${
                          isSelected ? 'border-[var(--pink)] bg-[var(--pink)]' : 'border-[var(--gray-border)] bg-white'
                        }`}
                      />
                    </div>
                    {option.disabled ? (
                      <div className="mt-4 rounded-2xl bg-[rgba(232,149,10,0.08)] px-3 py-2 text-xs font-semibold text-[var(--amber)]">
                        {option.disabledReason}
                      </div>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </section>

          <section className="panel-shell">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Separation parameters</h3>
              <p className="text-sm text-[var(--text-sub)]">Overlap and shift passes trade speed for transient integrity and accuracy.</p>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-[20px] border border-[var(--gray-border)] bg-[var(--gray-light)] px-4 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-[var(--text)]">Phase coherence on transient attacks</span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-[var(--pink)]">{model.overlap}</span>
                </div>
                <input
                  className="mt-4 w-full accent-[var(--pink)]"
                  max="16"
                  min="2"
                  type="range"
                  value={model.overlap}
                  onChange={(event) => onModelChange('overlap', Number(event.target.value))}
                />
                <p className="mt-3 text-sm text-[var(--text-sub)]">
                  Higher values preserve bow attacks, piano key strikes, and drum onsets. Increase for orchestral material. Decreases processing speed.
                </p>
              </div>

              <div className="rounded-[20px] border border-[var(--gray-border)] bg-[var(--gray-light)] px-4 py-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-[var(--text)]">Accuracy passes</span>
                  <span className="rounded-full bg-white px-3 py-1 font-semibold text-[var(--pink)]">{model.shifts}</span>
                </div>
                <div className="mt-4 flex gap-3">
                  {[0, 2, 4].map((shiftValue) => (
                    <button
                      key={shiftValue}
                      className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${
                        model.shifts === shiftValue
                          ? 'bg-[var(--pink)] text-white'
                          : 'bg-white text-[var(--text-sub)] ring-1 ring-[var(--gray-border)]'
                      }`}
                      type="button"
                      onClick={() => onModelChange('shifts', shiftValue)}
                    >
                      {shiftValue}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm text-[var(--text-sub)]">
                  Each pass pitch-shifts the source slightly to improve separation on ambiguous frequency content. 2 is sufficient for most material. 4 for dense arrangements.
                </p>
              </div>

              <div className="rounded-[20px] border border-[var(--gray-border)] bg-white px-4 py-4">
                <div className="text-sm font-semibold text-[var(--text)]">Output format</div>
                <div className="mt-2 rounded-full bg-[var(--pink-light)] px-4 py-2 text-sm font-semibold text-[var(--pink)]">
                  32-bit float WAV
                </div>
                <p className="mt-3 text-sm text-[var(--text-sub)]">Fixed by spec. Stems remain unnormalized and bounded by the source file edges.</p>
              </div>

              <div className="rounded-[20px] border border-[var(--gray-border)] bg-white px-4 py-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-[var(--text)]">Two-pass separation</div>
                  <button
                    className={`relative h-7 w-12 rounded-full transition ${
                      model.twoPass ? 'bg-[var(--pink)]' : 'bg-[var(--gray-border)]'
                    }`}
                    type="button"
                    onClick={() => onModelChange('twoPass', !model.twoPass)}
                  >
                    <span
                      className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${model.twoPass ? 'left-6' : 'left-1'}`}
                    />
                  </button>
                </div>
                <p className="mt-3 text-sm text-[var(--text-sub)]">
                  Runs a broad split first, then a fine instrument split on the result. Source protection is enforced — pass two always reads the original file, never a separated stem.
                </p>
              </div>
            </div>
          </section>
        </main>

        <aside className="space-y-6">
          <section className="panel-shell">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-[var(--text)]">Stems to separate</h3>
              <p className="text-sm text-[var(--text-sub)]">{selectedStemCount} selected for the next separation pass.</p>
            </div>
            <div className="space-y-3">
              {stems.map((stem) => {
                const isSelected = model.selectedStemIds.includes(stem.id)
                return (
                  <label
                    key={stem.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--gray-border)] bg-[var(--gray-light)] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <input checked={isSelected} type="checkbox" onChange={() => onStemToggle(stem.id)} />
                      <span className="inline-flex h-3.5 w-3.5 rounded-full" style={{ backgroundColor: stem.color }} />
                      <div>
                        <div className="font-semibold text-[var(--text)]">{stem.instrument}</div>
                        <div className="text-xs text-[var(--text-sub)]">{stem.stem_type}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-[var(--text-sub)]">
                      {stemStatusLabel(stem)}
                    </span>
                  </label>
                )
              })}
            </div>
          </section>

          <section className="panel-shell">
            <div className="text-sm font-semibold uppercase tracking-[0.12em] text-[var(--text-sub)]">Estimated processing time</div>
            <div className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)]">{formatDuration(estimatedRuntime)}</div>
            <p className="mt-2 text-sm text-[var(--text-sub)]">
              Based on {formatDuration(duration)} of source material, model choice, overlap, and shift count.
            </p>

            {notice ? <div className="mt-4 rounded-2xl bg-[var(--gray-light)] px-4 py-3 text-sm text-[var(--text-sub)]">{notice}</div> : null}
            {error ? <div className="mt-4 rounded-2xl border border-[rgba(192,57,43,0.3)] bg-[rgba(192,57,43,0.08)] px-4 py-3 text-sm text-[var(--red)]">{error}</div> : null}

            <div className="mt-5 flex flex-col gap-3">
              <button className="ghost-button" type="button" onClick={onBack}>
                Back to ingest
              </button>
              <button className="pill-button" disabled={isSubmitting} type="button" onClick={onRunSeparation}>
                {isSubmitting ? 'Starting separation…' : 'Run separation'}
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default ModelScreen
