export const STEM_TYPES = [
  'IsolatedStem',
  'BackingTrack',
  'FullMix',
  'TVMix',
  'Instrumental',
  'Acappella',
]

export const STEP_FLOW = [
  { id: 1, label: 'Ingest', route: '/ingest' },
  { id: 2, label: 'Model', route: '/model' },
  { id: 3, label: 'Workbench', route: '/workbench' },
]

export const MODEL_OPTIONS = [
  {
    label: 'HTDemucs FT',
    detail: 'Recommended for orchestral and classical material with balanced artifact control.',
    recommended: true,
    runtimeFactor: 1.05,
    available: true,
  },
  {
    label: 'MDX-Net HQ3',
    detail: 'Dense arrangement focus with slightly slower processing and strong separation bite.',
    runtimeFactor: 1.22,
    available: true,
  },
  {
    label: 'Ensemble',
    detail: 'Runs HTDemucs FT and MDX-Net HQ3 together with avg_wave for the highest quality.',
    runtimeFactor: 1.85,
    available: true,
  },
  {
    label: 'Kim Vocal 2',
    detail: 'Reserved for vocal-heavy material.',
    runtimeFactor: 1.12,
    available: false,
    disabled: true,
    disabledReason: 'Kim Vocal 2 is shown in the UI, but its backend model identifier has not been confirmed yet.',
  },
]
