function buildUrl(path) {
  const prefix = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  return `${prefix}${path}`
}

async function request(path, options = {}) {
  const response = await fetch(buildUrl(path), options)
  if (!response.ok) {
    const message = await response.text()

    try {
      const parsed = JSON.parse(message)
      throw new Error((parsed.detail ?? message) || `Request failed with status ${response.status}`)
    } catch {
      throw new Error(message || `Request failed with status ${response.status}`)
    }
  }

  return response.json()
}

export function ingestFiles(audioFile, scoreFile) {
  const formData = new FormData()
  formData.append('audio_file', audioFile)
  if (scoreFile) {
    formData.append('sib_file', scoreFile)
  }
  return request('/api/ingest', {
    method: 'POST',
    body: formData,
  })
}

export function startSeparation(payload) {
  return request('/api/separate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function getJob(jobId) {
  return request(`/api/job/${jobId}`)
}

export function runNullTest(payload) {
  return request('/api/null_test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function exportSession(payload) {
  return request('/api/export', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export function buildMediaUrl(path) {
  return buildUrl(`/api/media?path=${encodeURIComponent(path)}`)
}
