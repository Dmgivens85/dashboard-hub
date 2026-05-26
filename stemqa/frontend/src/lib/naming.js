function compact(value, { stripPeriods = false, maxLength } = {}) {
  let nextValue = String(value ?? '')
  if (stripPeriods) {
    nextValue = nextValue.replaceAll('.', '')
  }
  nextValue = nextValue.replaceAll(' ', '')
  if (typeof maxLength === 'number') {
    nextValue = nextValue.slice(0, maxLength)
  }
  return nextValue
}

export function buildName({
  catalogId,
  composer,
  title,
  instrument,
  stemType,
  version,
  sampleRate,
  bitDepth,
}) {
  const parts = [
    'TOMPLAY',
    compact(catalogId || 'UNKNOWN'),
    compact(composer || 'UNKNOWN'),
    compact(title || 'UNTITLED', { stripPeriods: true, maxLength: 12 }),
    compact(instrument || 'Stem'),
    stemType || 'IsolatedStem',
    `v${String(version ?? 1).padStart(2, '0')}`,
    `${Math.floor((sampleRate ?? 48_000) / 1000)}k`,
    `${bitDepth ?? 32}b`,
  ]

  return `${parts.join('_')}.wav`
}

export function buildPreviewNames({ stems, sessionMeta, sampleRate, bitDepth }) {
  return stems.map((stem) =>
    buildName({
      catalogId: sessionMeta.catalog_id,
      composer: sessionMeta.composer,
      title: sessionMeta.title,
      instrument: stem.instrument,
      stemType: stem.stem_type,
      version: sessionMeta.version,
      sampleRate,
      bitDepth,
    }),
  )
}
