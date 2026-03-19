function normalizedBaseUrl(): string {
  const raw = (import.meta.env.VITE_CF_API_BASE_URL as string | undefined) ?? ''
  return raw.replace(/\/+$/, '')
}

function apiUrl(path: string): string {
  const base = normalizedBaseUrl()
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return base ? `${base}${normalizedPath}` : normalizedPath
}

export type Bytes = Uint8Array<ArrayBuffer>

export async function getJson<T>(path: string): Promise<T> {
  const url = apiUrl(path)
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`)
  }

  return (await res.json()) as T
}

export async function requestJson<T>(
  path: string,
  opts: {
    method: 'POST' | 'PUT' | 'DELETE'
    body?: unknown
  },
): Promise<T | null> {
  const url = apiUrl(path)
  const hasBody = opts.body !== undefined

  const res = await fetch(url, {
    method: opts.method,
    headers: {
      Accept: 'application/json',
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
    },
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`)
  }

  if (opts.method === 'DELETE' || res.status === 204) return null

  const text = await res.text().catch(() => '')
  if (!text.trim()) return null
  return JSON.parse(text) as T
}

async function postBytes(url: string, bytes: Bytes, contentType: string): Promise<Bytes> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': contentType,
    },
    body: bytes,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`)
  }

  const buf = await res.arrayBuffer()
  return new Uint8Array(buf)
}

export async function zipNormalize(zipBytes: Bytes): Promise<Bytes> {
  return postBytes(apiUrl('/api/zip_normalize'), zipBytes, 'application/zip')
}

export async function parquetDecrypt(encryptedParquetBytes: Bytes): Promise<Bytes> {
  return postBytes(apiUrl('/api/parquet_decrypt'), encryptedParquetBytes, 'application/octet-stream')
}

export async function parquetToCsv(parquetBytes: Bytes): Promise<Bytes> {
  return postBytes(apiUrl('/api/parquet_to_csv'), parquetBytes, 'application/octet-stream')
}
