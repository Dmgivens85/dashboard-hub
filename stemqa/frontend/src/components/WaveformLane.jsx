import { useEffect, useRef } from 'react'
import WaveSurfer from 'wavesurfer.js'

function WaveformLane({
  audioUrl,
  color,
  backgroundColor,
  height = 50,
  isPrimary,
  isSelected,
  muted,
  onApiChange,
  onDuration,
  onSeek,
  onTimeUpdate,
  playing,
  trackId,
  syncTime,
}) {
  const containerRef = useRef(null)
  const waveSurferRef = useRef(null)
  const readyRef = useRef(false)
  const apiChangeRef = useRef(onApiChange)
  const durationRef = useRef(onDuration)
  const seekRef = useRef(onSeek)
  const timeUpdateRef = useRef(onTimeUpdate)

  useEffect(() => {
    apiChangeRef.current = onApiChange
  }, [onApiChange])

  useEffect(() => {
    durationRef.current = onDuration
  }, [onDuration])

  useEffect(() => {
    seekRef.current = onSeek
  }, [onSeek])

  useEffect(() => {
    timeUpdateRef.current = onTimeUpdate
  }, [onTimeUpdate])

  useEffect(() => {
    if (!containerRef.current || !audioUrl) {
      apiChangeRef.current?.(trackId, null)
      return undefined
    }

    const waveSurfer = WaveSurfer.create({
      container: containerRef.current,
      height,
      url: audioUrl,
      waveColor: `${color}66`,
      progressColor: color,
      cursorWidth: 0,
      normalize: false,
      dragToSeek: true,
      interact: true,
      barGap: 1.5,
      barWidth: 2,
      barRadius: 3,
    })

    waveSurferRef.current = waveSurfer
    readyRef.current = false

    const api = {
      play: () => waveSurfer.play(),
      pause: () => waveSurfer.pause(),
      setTime: (time) => waveSurfer.setTime(time),
      setVolume: (volume) => waveSurfer.setVolume(volume),
      getDuration: () => waveSurfer.getDuration(),
      getCurrentTime: () => waveSurfer.getCurrentTime(),
    }

    waveSurfer.on('ready', (duration) => {
      readyRef.current = true
      api.setVolume(muted ? 0 : 1)
      apiChangeRef.current?.(trackId, api)
      if (isPrimary) {
        durationRef.current?.(duration)
      }
    })

    waveSurfer.on('interaction', (time) => {
      seekRef.current?.(time)
    })

    if (isPrimary) {
      waveSurfer.on('timeupdate', (time) => {
        timeUpdateRef.current?.(time)
      })
    }

    return () => {
      readyRef.current = false
      waveSurfer.destroy()
      waveSurferRef.current = null
      apiChangeRef.current?.(trackId, null)
    }
  }, [audioUrl, color, height, isPrimary, muted, trackId])

  useEffect(() => {
    if (!waveSurferRef.current || !readyRef.current) {
      return
    }
    waveSurferRef.current.setVolume(muted ? 0 : 1)
  }, [muted])

  useEffect(() => {
    if (!waveSurferRef.current || !readyRef.current) {
      return
    }

    if (playing) {
      waveSurferRef.current.play()
      return
    }

    waveSurferRef.current.pause()
  }, [playing])

  useEffect(() => {
    if (!waveSurferRef.current || !readyRef.current || syncTime == null) {
      return
    }

    const currentTime = waveSurferRef.current.getCurrentTime()
    if (Math.abs(currentTime - syncTime) > 0.08) {
      waveSurferRef.current.setTime(syncTime)
    }
  }, [syncTime])

  if (!audioUrl) {
    return (
      <div
        className={`relative overflow-hidden rounded-[14px] border border-[var(--gray-border)] ${
          isSelected ? 'ring-2 ring-[var(--pink)]/35' : ''
        }`}
        style={{ backgroundColor }}
      >
        <div className="absolute inset-0 bg-[repeating-linear-gradient(90deg,transparent,transparent_12px,rgba(255,255,255,0.5)_12px,rgba(255,255,255,0.5)_13px)]" />
        <div className="flex h-full items-center px-4 text-xs uppercase tracking-[0.12em] text-[var(--text-sub)]">
          Awaiting audio
        </div>
      </div>
    )
  }

  return (
    <div
      className={`overflow-hidden rounded-[14px] border border-[var(--gray-border)] ${
        isSelected ? 'ring-2 ring-[var(--pink)]/35' : ''
      }`}
      style={{ backgroundColor }}
    >
      <div ref={containerRef} />
    </div>
  )
}

export default WaveformLane
