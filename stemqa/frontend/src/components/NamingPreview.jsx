function NamingPreview({ names }) {
  return (
    <section className="panel-shell">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text)]">Output naming preview</h3>
          <p className="text-sm text-[var(--text-sub)]">Live build-name output using the Tomplay convention.</p>
        </div>
        <span className="rounded-full bg-[var(--pink-light)] px-3 py-1 text-xs font-semibold text-[var(--pink)]">
          {names.length} stems
        </span>
      </div>

      <div className="space-y-3">
        {names.map((name) => (
          <div
            key={name}
            className="rounded-2xl border border-[var(--gray-border)] bg-[linear-gradient(180deg,#fff,#fdf9fb)] px-3 py-3 font-mono text-xs text-[var(--text-sub)] sm:text-sm"
          >
            {name}
          </div>
        ))}
      </div>
    </section>
  )
}

export default NamingPreview
