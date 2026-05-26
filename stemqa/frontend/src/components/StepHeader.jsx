import { STEP_FLOW } from '../lib/constants.js'

function StepHeader({ activeStep, title, subtitle, aside }) {
  return (
    <header className="mb-6 rounded-[22px] border border-[var(--gray-border)] bg-white px-5 py-5 shadow-[0_18px_36px_rgba(232,32,118,0.08)] sm:px-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(145deg,var(--pink-light),#fff)] ring-1 ring-[var(--pink-border)]">
            <div className="relative h-8 w-8">
              <span className="absolute left-0 top-1 h-3 w-3 rounded-full bg-[var(--pink)]" />
              <span className="absolute left-3 top-0 h-4 w-4 rounded-full bg-[var(--pink)]/75" />
              <span className="absolute bottom-0 right-0 h-5 w-5 rounded-full border-4 border-[var(--pink)] bg-white" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--pink)]">Tomplay</span>
              <span className="text-2xl font-semibold tracking-[-0.03em] text-[var(--text)]">stemQA</span>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-[2.35rem]">
              {title}
            </h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--text-sub)] sm:text-base">{subtitle}</p>
          </div>
        </div>

        {aside ? <div className="lg:min-w-[220px]">{aside}</div> : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {STEP_FLOW.map((step) => {
          const isActive = step.id === activeStep
          const isComplete = step.id < activeStep
          return (
            <div key={step.id} className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? 'bg-[var(--pink)] text-white shadow-[0_12px_24px_rgba(232,32,118,0.28)]'
                    : isComplete
                      ? 'bg-[var(--pink-light)] text-[var(--pink)]'
                      : 'bg-[var(--gray-light)] text-[var(--text-sub)]'
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : isComplete
                        ? 'bg-white text-[var(--pink)]'
                        : 'bg-white text-[var(--text-sub)]'
                  }`}
                >
                  {step.id}
                </span>
                <span>{step.label}</span>
              </div>
              {step.id < STEP_FLOW.length ? <span className="text-[var(--gray)]">›</span> : null}
            </div>
          )
        })}
      </div>
    </header>
  )
}

export default StepHeader
