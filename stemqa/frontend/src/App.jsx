import {
  startTransition,
  useEffect,
  useState,
} from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import IngestScreen from './components/IngestScreen.jsx'
import ModelScreen from './components/ModelScreen.jsx'
import Workbench from './components/Workbench.jsx'
import {
  buildMediaUrl,
  exportSession,
  getJob,
  ingestFiles,
  runNullTest,
  startSeparation,
} from './lib/api.js'
import { MODEL_OPTIONS } from './lib/constants.js'
import { buildPreviewNames } from './lib/naming.js'

const DRAFT_KEY = 'stemqa-draft-v1'
const STEM_COLORS = ['#E82076', '#2AB76E', '#4F8FF7', '#E8950A', '#00A6A6', '#C0392B', '#9B9B9B']

function isActiveFlag(flag) {
  return (flag?.state ?? 'active') === 'active'
}

function createStemRow(stem = {}, index = 0) {
  const sourceBadge = stem.source_badge ?? stem.sourceBadge ?? 'manual'
  const originalInstrument = stem.instrument ?? stem.name ?? `Stem ${index + 1}`

  return {
    id: stem.id ?? `stem-${crypto.randomUUID()}`,
    instrument: originalInstrument,
    originalInstrument,
    origin: sourceBadge,
    source_badge: sourceBadge,
    detection_confidence:
      typeof stem.detection_confidence === 'number' ? stem.detection_confidence : sourceBadge === 'manual' ? 0.74 : 1,
    stem_type: stem.stem_type ?? 'IsolatedStem',
    color: stem.color ?? STEM_COLORS[index % STEM_COLORS.length],
    conflictAcknowledged: sourceBadge !== 'conflict',
    deleted: false,
  }
}

function createInitialState() {
  return {
    sourcePath: '',
    sourcePreviewUrl: '',
    scorePath: '',
    sourceFileName: '',
    scoreFileName: '',
    audio: null,
    checks: [],
    score: null,
    sourceType: 'Unknown',
    stems: [createStemRow({}, 0)],
    warningsAcknowledged: false,
    sessionMeta: {
      catalog_id: '',
      composer: '',
      title: '',
      version: 1,
      session_name: 'stemqa-session',
    },
    model: {
      selected: 'HTDemucs FT',
      overlap: 8,
      shifts: 2,
      twoPass: false,
      selectedStemIds: [],
    },
    separation: {
      job_id: '',
      status: 'idle',
      progress: 0,
      stems: [],
      flags: [],
      error: '',
    },
    nullTest: {
      status: 'idle',
      result: null,
      error: '',
    },
  }
}

function loadDraft() {
  try {
    const rawDraft = window.localStorage.getItem(DRAFT_KEY)
    if (!rawDraft) {
      return createInitialState()
    }

    const parsed = JSON.parse(rawDraft)
    const initialState = createInitialState()
    return {
      ...initialState,
      ...parsed,
      stems: (parsed.stems?.length ? parsed.stems : initialState.stems).map((stem, index) =>
        createStemRow(stem, index),
      ),
      model: {
        ...initialState.model,
        ...parsed.model,
      },
      separation: {
        ...initialState.separation,
        ...parsed.separation,
      },
      nullTest: {
        ...initialState.nullTest,
        ...parsed.nullTest,
      },
      sessionMeta: {
        ...initialState.sessionMeta,
        ...parsed.sessionMeta,
      },
    }
  } catch {
    return createInitialState()
  }
}

function formatModelLabel(label) {
  return label.toLowerCase().replaceAll(' ', '-')
}

function App() {
  const navigate = useNavigate()
  const [session, setSession] = useState(loadDraft)
  const [files, setFiles] = useState({
    audioFile: null,
    scoreFile: null,
    sourcePreviewUrl: '',
  })
  const [ui, setUi] = useState({
    ingestSubmitting: false,
    ingestError: '',
    separationSubmitting: false,
    exportSubmitting: false,
    separationError: '',
    separationNotice: '',
    draftNotice: '',
    nullTestOpen: false,
    nullTestSubmitting: false,
  })

  useEffect(
    () => () => {
      if (files.sourcePreviewUrl) {
        URL.revokeObjectURL(files.sourcePreviewUrl)
      }
    },
    [files.sourcePreviewUrl],
  )

  const activeStems = session.stems.filter((stem) => !stem.deleted)
  const selectedStems = activeStems.filter((stem) => session.model.selectedStemIds.includes(stem.id))
  const unresolvedFlags = session.separation.flags.filter((flag) => isActiveFlag(flag))
  const hardReject = Boolean(session.audio?.hard_reject)
  const hasWarnings = Boolean(session.audio?.soft_flags?.length)
  const hasUnacknowledgedConflict = activeStems.some(
    (stem) => stem.source_badge === 'conflict' && !stem.conflictAcknowledged,
  )
  const canAdvanceToModel =
    Boolean(session.sourcePath) &&
    !hardReject &&
    !hasUnacknowledgedConflict &&
    (!hasWarnings || session.warningsAcknowledged)

  const ingestBlockingReason = !session.sourcePath
    ? 'Upload a source file to continue.'
    : hardReject
      ? 'Resolve the hard reject conditions before continuing.'
      : hasUnacknowledgedConflict
        ? 'Acknowledge all naming conflicts before continuing.'
        : hasWarnings && !session.warningsAcknowledged
          ? 'Acknowledge the ingest warnings to continue.'
          : ''

  const previewNames = buildPreviewNames({
    stems: activeStems,
    sessionMeta: session.sessionMeta,
    sampleRate: session.audio?.sample_rate ?? 48_000,
    bitDepth: 32,
  })

  const applyIngestResponse = (response, sourcePreviewUrl, sourceFileName, scoreFileName) => {
    const responseStems =
      response.stems?.length > 0
        ? response.stems.map((stem, index) => createStemRow(stem, index))
        : activeStems.length > 0
          ? activeStems
          : [createStemRow({}, 0)]

    startTransition(() => {
      setSession((currentSession) => ({
        ...currentSession,
        sourcePath: response.file_path,
        sourcePreviewUrl,
        scorePath: response.score_path ?? '',
        sourceFileName,
        scoreFileName,
        audio: response.audio,
        checks: response.checks,
        score: response.score,
        sourceType: response.source_type,
        stems: responseStems,
        warningsAcknowledged: response.audio?.soft_flags?.length === 0,
        model: {
          ...currentSession.model,
          selectedStemIds: responseStems.map((stem) => stem.id),
        },
        separation: createInitialState().separation,
        nullTest: createInitialState().nullTest,
      }))
      setUi((currentUi) => ({
        ...currentUi,
        ingestSubmitting: false,
        ingestError: '',
        separationError: '',
        separationNotice: '',
      }))
    })
  }

  const submitIngest = async ({
    audioFile = files.audioFile,
    scoreFile = files.scoreFile,
    sourcePreviewUrl = files.sourcePreviewUrl,
  } = {}) => {
    if (!audioFile) {
      return
    }

    setUi((currentUi) => ({
      ...currentUi,
      ingestSubmitting: true,
      ingestError: '',
      draftNotice: '',
    }))

    try {
      const response = await ingestFiles(audioFile, scoreFile)
      applyIngestResponse(response, sourcePreviewUrl, audioFile.name, scoreFile?.name ?? '')
    } catch (error) {
      setUi((currentUi) => ({
        ...currentUi,
        ingestSubmitting: false,
        ingestError: error.message,
      }))
    }
  }

  const handleAudioSelected = async (audioFile) => {
    const nextPreviewUrl = audioFile ? URL.createObjectURL(audioFile) : ''
    setFiles((currentFiles) => ({
      ...currentFiles,
      audioFile,
      sourcePreviewUrl: nextPreviewUrl,
    }))
    await submitIngest({
      audioFile,
      scoreFile: files.scoreFile,
      sourcePreviewUrl: nextPreviewUrl,
    })
  }

  const handleScoreSelected = async (scoreFile) => {
    setFiles((currentFiles) => ({
      ...currentFiles,
      scoreFile,
    }))

    if (files.audioFile) {
      await submitIngest({
        audioFile: files.audioFile,
        scoreFile,
        sourcePreviewUrl: files.sourcePreviewUrl,
      })
    }
  }

  const handleMetaChange = (field, value) => {
    setSession((currentSession) => ({
      ...currentSession,
      sessionMeta: {
        ...currentSession.sessionMeta,
        [field]: value,
      },
    }))
  }

  const handleStemChange = (stemId, field, value) => {
    setSession((currentSession) => {
      const nextStems = currentSession.stems.map((stem) => {
        if (stem.id !== stemId) {
          return stem
        }

        const nextStem = {
          ...stem,
          [field]: value,
        }

        if (field === 'instrument' && stem.origin === 'score') {
          if (value !== stem.originalInstrument) {
            nextStem.source_badge = 'conflict'
            nextStem.conflictAcknowledged = false
          } else {
            nextStem.source_badge = 'score'
            nextStem.conflictAcknowledged = true
          }
        }

        return nextStem
      })

      return {
        ...currentSession,
        stems: nextStems,
      }
    })
  }

  const handleStemDelete = (stemId) => {
    setSession((currentSession) => ({
      ...currentSession,
      stems: currentSession.stems.filter((stem) => stem.id !== stemId),
      model: {
        ...currentSession.model,
        selectedStemIds: currentSession.model.selectedStemIds.filter((selectedId) => selectedId !== stemId),
      },
    }))
  }

  const handleStemAdd = () => {
    setSession((currentSession) => {
      const nextStem = createStemRow(
        {
          instrument: `Manual Stem ${currentSession.stems.length + 1}`,
          source_badge: 'manual',
          detection_confidence: 0.74,
        },
        currentSession.stems.length,
      )

      return {
        ...currentSession,
        stems: [...currentSession.stems, nextStem],
        model: {
          ...currentSession.model,
          selectedStemIds: [...currentSession.model.selectedStemIds, nextStem.id],
        },
      }
    })
  }

  const handleConflictAcknowledgement = (stemId) => {
    setSession((currentSession) => ({
      ...currentSession,
      stems: currentSession.stems.map((stem) =>
        stem.id === stemId ? { ...stem, conflictAcknowledged: true } : stem,
      ),
    }))
  }

  const handleWarningAcknowledgement = (acknowledged) => {
    setSession((currentSession) => ({
      ...currentSession,
      warningsAcknowledged: acknowledged,
    }))
  }

  const handleSaveDraft = () => {
    const serializableState = {
      ...session,
      sourcePreviewUrl: '',
      nullTest: {
        ...session.nullTest,
        result: session.nullTest.result
          ? {
              ...session.nullTest.result,
              residual_url: '',
            }
          : null,
      },
    }

    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(serializableState))
    setUi((currentUi) => ({
      ...currentUi,
      draftNotice: `Draft saved at ${new Date().toLocaleTimeString()}`,
    }))
  }

  const handleProceedToModel = () => {
    if (!canAdvanceToModel) {
      return
    }
    startTransition(() => navigate('/model'))
  }

  const handleModelChange = (field, value) => {
    setSession((currentSession) => ({
      ...currentSession,
      model: {
        ...currentSession.model,
        [field]: value,
      },
    }))
  }

  const handleStemSelectionToggle = (stemId) => {
    setSession((currentSession) => {
      const selectedIds = currentSession.model.selectedStemIds.includes(stemId)
        ? currentSession.model.selectedStemIds.filter((currentId) => currentId !== stemId)
        : [...currentSession.model.selectedStemIds, stemId]

      return {
        ...currentSession,
        model: {
          ...currentSession.model,
          selectedStemIds: selectedIds,
        },
      }
    })
  }

  const handleRunSeparation = async () => {
    const selectedModel = MODEL_OPTIONS.find((option) => option.label === session.model.selected)

    if (!session.sourcePath || !selectedModel || selectedModel.disabled) {
      setUi((currentUi) => ({
        ...currentUi,
        separationError: selectedModel?.disabled
          ? selectedModel.disabledReason
          : 'Upload a source file before running separation.',
      }))
      return
    }

    if (selectedStems.length === 0) {
      setUi((currentUi) => ({
        ...currentUi,
        separationError: 'Select at least one stem before running separation.',
      }))
      return
    }

    setUi((currentUi) => ({
      ...currentUi,
      separationSubmitting: true,
      separationError: '',
      separationNotice: '',
    }))

    try {
      const response = await startSeparation({
        file_path: session.sourcePath,
        model: session.model.selected,
        overlap: session.model.overlap,
        shifts: session.model.shifts,
        score_path: session.scorePath || null,
        stems: selectedStems.map((stem) => ({
          id: stem.id,
          instrument: stem.instrument,
          stem_type: stem.stem_type,
        })),
      })

      startTransition(() => {
        setSession((currentSession) => ({
          ...currentSession,
          separation: {
            ...currentSession.separation,
            job_id: response.job_id,
            status: response.status,
            progress: 0,
            stems: [],
            flags: [],
            error: '',
          },
        }))
        setUi((currentUi) => ({
          ...currentUi,
          separationSubmitting: false,
          separationError: '',
          separationNotice: `Separation queued with ${formatModelLabel(session.model.selected)}.`,
        }))
      })

      startTransition(() => navigate('/workbench'))
    } catch (error) {
      setUi((currentUi) => ({
        ...currentUi,
        separationSubmitting: false,
        separationError: error.message,
      }))
    }
  }

  useEffect(() => {
    if (!session.separation.job_id || !['processing', 'queued'].includes(session.separation.status)) {
      return undefined
    }

    let timeoutId
    let cancelled = false

    const poll = async () => {
      try {
        const response = await getJob(session.separation.job_id)
        if (cancelled) {
          return
        }

        startTransition(() => {
          setSession((currentSession) => ({
            ...currentSession,
            separation: {
              ...currentSession.separation,
              ...response,
              flags: response.flags ?? currentSession.separation.flags,
              stems: response.stems ?? currentSession.separation.stems,
              error: response.error ?? '',
            },
          }))
        })

        if (response.status === 'complete') {
          const nextFlags = response.flags ?? []
          const activeFlagCount = nextFlags.filter((flag) => isActiveFlag(flag)).length
          setUi((currentUi) => ({
            ...currentUi,
            separationNotice:
              nextFlags.length > 0
                ? `Separation complete. ${activeFlagCount} flag${activeFlagCount === 1 ? '' : 's'} require engineer acknowledgement before export unlocks.`
                : 'Separation complete. No flags were raised; export is ready once you review the workbench.',
          }))
          return
        }

        if (response.status === 'failed') {
          setUi((currentUi) => ({
            ...currentUi,
            separationError: response.error ?? 'Separation failed.',
          }))
          return
        }
      } catch (error) {
        if (!cancelled) {
          setUi((currentUi) => ({
            ...currentUi,
            separationError: error.message,
          }))
        }
      }

      timeoutId = window.setTimeout(poll, 2000)
    }

    timeoutId = window.setTimeout(poll, 1000)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
    }
  }, [session.separation.job_id, session.separation.status])

  const handleRunNullTest = async () => {
    if (session.separation.stems.length === 0) {
      return
    }

    setUi((currentUi) => ({
      ...currentUi,
      nullTestSubmitting: true,
    }))

    try {
      const response = await runNullTest({
        source_path: session.sourcePath,
        stem_paths: session.separation.stems.map((stem) => stem.path),
      })

      startTransition(() => {
        setSession((currentSession) => ({
          ...currentSession,
          nullTest: {
            status: 'complete',
            error: '',
            result: {
              ...response,
              residual_url: buildMediaUrl(response.residual_path),
            },
          },
        }))
        setUi((currentUi) => ({
          ...currentUi,
          nullTestSubmitting: false,
        }))
      })
    } catch (error) {
      setSession((currentSession) => ({
        ...currentSession,
        nullTest: {
          ...currentSession.nullTest,
          status: 'failed',
          error: error.message,
        },
      }))
      setUi((currentUi) => ({
        ...currentUi,
        nullTestSubmitting: false,
      }))
    }
  }

  const handleFlagStateChange = (flagId, nextState) => {
    setSession((currentSession) => ({
      ...currentSession,
      separation: {
        ...currentSession.separation,
        flags: currentSession.separation.flags.map((flag) =>
          flag.id === flagId ? { ...flag, state: nextState } : flag,
        ),
      },
    }))
  }

  const handleFlagReassign = (flagId, track) => {
    if (!track) {
      return
    }

    setSession((currentSession) => ({
      ...currentSession,
      separation: {
        ...currentSession.separation,
        flags: currentSession.separation.flags.map((flag) =>
          flag.id === flagId
            ? {
                ...flag,
                stem_name: track.label,
                stem_path: track.path || null,
                state: 'active',
              }
            : flag,
        ),
      },
    }))
  }

  const handleExportAttempt = async () => {
    if (session.separation.status !== 'complete') {
      return
    }

    if (unresolvedFlags.length > 0) {
      setUi((currentUi) => ({
        ...currentUi,
        separationNotice: `${unresolvedFlags.length} flag${unresolvedFlags.length === 1 ? '' : 's'} still need engineer action before export can unlock.`,
      }))
      return
    }

    setUi((currentUi) => ({
      ...currentUi,
      exportSubmitting: true,
      separationError: '',
    }))

    try {
      const response = await exportSession({
        job_id: session.separation.job_id,
        session_meta: {
          ...session.sessionMeta,
          stems: workbenchStemTracks
            .filter((track) => track.path)
            .map((track) => ({
              name: track.label,
              instrument: track.label,
              stem_type: track.stemType,
            })),
        },
        flags: session.separation.flags,
      })

      setUi((currentUi) => ({
        ...currentUi,
        exportSubmitting: false,
        separationNotice: `Exported ${response.output_paths?.length ?? 0} stem${response.output_paths?.length === 1 ? '' : 's'} to ${response.session_log_path}.`,
      }))
    } catch (error) {
      setUi((currentUi) => ({
        ...currentUi,
        exportSubmitting: false,
        separationError: error.message,
      }))
    }
  }

  const sourceTrack = {
    id: 'source',
    label: 'Source',
    audioUrl: files.sourcePreviewUrl || (session.sourcePath ? buildMediaUrl(session.sourcePath) : ''),
    color: '#2AB76E',
    backgroundColor: '#F0FAF5',
  }

  const workbenchStemTracks =
    session.separation.stems.length > 0
      ? session.separation.stems.map((separatedStem, index) => {
          const configuredStem =
            selectedStems[index] ?? activeStems.find((stem) => stem.instrument === separatedStem.name) ?? null
          const color = configuredStem?.color ?? STEM_COLORS[index % STEM_COLORS.length]
          return {
            id: configuredStem?.id ?? `separated-${index + 1}`,
            label: separatedStem.name ?? configuredStem?.instrument ?? `Stem ${index + 1}`,
            stemType: separatedStem.stem_type ?? configuredStem?.stem_type ?? 'IsolatedStem',
            audioUrl: separatedStem.path ? buildMediaUrl(separatedStem.path) : '',
            color,
            backgroundColor: `${color}10`,
            filename: separatedStem?.filename ?? '',
            path: separatedStem?.path ?? '',
          }
        })
      : selectedStems.map((stem) => ({
          id: stem.id,
          label: stem.instrument,
          stemType: stem.stem_type,
          audioUrl: '',
          color: stem.color,
          backgroundColor: `${stem.color}10`,
          filename: '',
          path: '',
        }))

  const residualTrack = session.nullTest.result
    ? {
        id: 'null-residual',
        label: 'Null residual',
        audioUrl: session.nullTest.result.residual_url,
        color: '#5DBA9A',
        backgroundColor: '#EFFAF7',
      }
    : {
        id: 'null-residual',
        label: 'Null residual',
        audioUrl: '',
        color: '#5DBA9A',
        backgroundColor: '#EFFAF7',
      }

  const estimatedDurationSeconds = session.audio?.duration ?? 0
  const canExport = session.separation.status === 'complete' && unresolvedFlags.length === 0
  const exportLockedReason =
    session.separation.status !== 'complete'
      ? 'Separation must finish before export can unlock.'
      : unresolvedFlags.length > 0
        ? `${unresolvedFlags.length} flag${unresolvedFlags.length === 1 ? '' : 's'} still require engineer acknowledgement.`
        : session.separation.flags.length > 0
          ? 'All flags have been resolved. Export is ready.'
          : 'No flags detected. Export is ready.'

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff_0%,#fdf7fa_52%,#fff_100%)] px-4 py-5 text-[var(--text)] sm:px-6 lg:px-10">
      <Routes>
        <Route path="/" element={<Navigate to="/ingest" replace />} />
        <Route
          path="/ingest"
          element={
            <IngestScreen
              audio={session.audio}
              blockingReason={ingestBlockingReason}
              canProceed={canAdvanceToModel}
              checks={session.checks}
              draftNotice={ui.draftNotice}
              error={ui.ingestError}
              isSubmitting={ui.ingestSubmitting}
              namingPreview={previewNames}
              onAddStem={handleStemAdd}
              onAudioSelected={handleAudioSelected}
              onConflictAcknowledged={handleConflictAcknowledgement}
              onMetaChange={handleMetaChange}
              onProceed={handleProceedToModel}
              onSaveDraft={handleSaveDraft}
              onScoreSelected={handleScoreSelected}
              onStemChange={handleStemChange}
              onStemDelete={handleStemDelete}
              onWarningAcknowledged={handleWarningAcknowledgement}
              score={session.score}
              scoreFileName={session.scoreFileName}
              sessionMeta={session.sessionMeta}
              sourceFileName={session.sourceFileName}
              sourceType={session.sourceType}
              stems={activeStems}
              warningsAcknowledged={session.warningsAcknowledged}
            />
          }
        />
        <Route
          path="/model"
          element={
            !session.sourcePath ? (
              <Navigate to="/ingest" replace />
            ) : (
              <ModelScreen
                duration={estimatedDurationSeconds}
                error={ui.separationError}
                isSubmitting={ui.separationSubmitting}
                model={session.model}
                notice={ui.separationNotice}
                onBack={() => navigate('/ingest')}
                onModelChange={handleModelChange}
                onRunSeparation={handleRunSeparation}
                onStemToggle={handleStemSelectionToggle}
                stems={activeStems}
              />
            )
          }
        />
        <Route
          path="/workbench"
          element={
            !session.sourcePath ? (
              <Navigate to="/ingest" replace />
            ) : (
              <Workbench
                canExport={canExport}
                exportLockedReason={exportLockedReason}
                flags={session.separation.flags}
                isExporting={ui.exportSubmitting}
                nullTest={session.nullTest}
                nullTestOpen={ui.nullTestOpen}
                onBack={() => navigate('/model')}
                onExport={handleExportAttempt}
                onFlagReassign={handleFlagReassign}
                onFlagStateChange={handleFlagStateChange}
                onNullTestClose={() => setUi((currentUi) => ({ ...currentUi, nullTestOpen: false }))}
                onNullTestOpen={() => setUi((currentUi) => ({ ...currentUi, nullTestOpen: true }))}
                onRunNullTest={handleRunNullTest}
                residualTrack={residualTrack}
                separation={session.separation}
                sourceTrack={sourceTrack}
                stemTracks={workbenchStemTracks}
                isNullTestRunning={ui.nullTestSubmitting}
              />
            )
          }
        />
      </Routes>
    </div>
  )
}

export default App
