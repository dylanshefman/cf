import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson } from '../utils/api'

export type BuildingCompact = {
  name?: unknown
  city?: unknown
  type?: unknown
  region?: unknown
}

export type BuildingsBySiteCodeCompact = Record<string, BuildingCompact>

export type BuildingRaw = Record<string, unknown>
export type BuildingsRaw = BuildingRaw[] | Record<string, unknown>

export type BuildingsBySiteIdentifierRaw = Record<string, BuildingRaw>

type Snapshot = {
  data: BuildingsBySiteCodeCompact | null
  raw: BuildingsRaw | null
  bySiteIdentifierRaw: BuildingsBySiteIdentifierRaw | null
  loading: boolean
  error: string
}

const snapshots = new Map<string, Snapshot>()
const listeners = new Map<string, Set<() => void>>()
const inflight = new Map<string, Promise<void>>()

function keyFor(siteCode: number): string {
  return String(siteCode)
}

function getSnapshot(key: string): Snapshot {
  const existing = snapshots.get(key)
  if (existing) return existing

  // Important: useSyncExternalStore requires getSnapshot() to be referentially stable
  // when nothing changed. Store a per-key initial snapshot so we don't create a new
  // object on every call.
  const initial: Snapshot = {
    data: null,
    raw: null,
    bySiteIdentifierRaw: null,
    loading: false,
    error: '',
  }
  snapshots.set(key, initial)
  return initial
}

function setSnapshot(key: string, next: Snapshot) {
  snapshots.set(key, next)
  const ls = listeners.get(key)
  if (!ls) return
  for (const cb of ls) cb()
}

function subscribe(key: string, cb: () => void): () => void {
  const ls = listeners.get(key) ?? new Set<() => void>()
  ls.add(cb)
  listeners.set(key, ls)
  return () => {
    const cur = listeners.get(key)
    if (!cur) return
    cur.delete(cb)
    if (!cur.size) listeners.delete(key)
  }
}

function normalizeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function compactBySiteIdentifier(buildings: unknown): BuildingsBySiteCodeCompact {
  // If the backend was called with ?site_code=1 historically, it returned the compact map already.
  // We now call the raw endpoint (list) and recreate that same compact map on the client.
  if (buildings && typeof buildings === 'object' && !Array.isArray(buildings)) {
    return buildings as BuildingsBySiteCodeCompact
  }

  if (!Array.isArray(buildings)) return {}

  const out: BuildingsBySiteCodeCompact = {}

  for (const b of buildings) {
    if (!b || typeof b !== 'object') continue

    const site = (b as any).site
    const address = (b as any).address

    const siteIdentifier = site && typeof site === 'object' ? (site as any).identifier : undefined
    if (!siteIdentifier) continue

    out[String(siteIdentifier)] = {
      name: site && typeof site === 'object' ? (site as any).name : undefined,
      city: address && typeof address === 'object' ? (address as any).city : undefined,
      type: (b as any).primaryFunction,
      region: (b as any).region,
    }
  }

  return out
}

function indexRawBySiteIdentifier(buildings: unknown): BuildingsBySiteIdentifierRaw {
  if (!Array.isArray(buildings)) return {}

  const out: BuildingsBySiteIdentifierRaw = {}

  for (const b of buildings) {
    if (!b || typeof b !== 'object') continue

    const site = (b as any).site
    const siteIdentifier = site && typeof site === 'object' ? (site as any).identifier : undefined
    if (!siteIdentifier) continue

    out[String(siteIdentifier)] = b as BuildingRaw
  }

  return out
}

async function doFetch(siteCode: number, opts: { force: boolean }): Promise<void> {
  const key = keyFor(siteCode)

  if (!opts.force) {
    const snap = getSnapshot(key)
    if (snap.loading) return
    if (snap.data !== null) return
    if (snap.error) return
  }

  const existing = getSnapshot(key)
  setSnapshot(key, { ...existing, loading: true, error: '' })

  const url = `/api/buildings`

  try {
    const payload = await getJson<unknown>(url)
    const asObject = compactBySiteIdentifier(payload)
    const raw: BuildingsRaw | null = payload && typeof payload === 'object' ? (payload as BuildingsRaw) : null
    const bySiteIdentifierRaw = indexRawBySiteIdentifier(payload)
    const prev = getSnapshot(key)
    setSnapshot(key, { ...prev, data: asObject, raw, bySiteIdentifierRaw, loading: false, error: '' })
  } catch (e: unknown) {
    const prev = getSnapshot(key)
    setSnapshot(key, {
      ...prev,
      data: prev.data ?? ({} as BuildingsBySiteCodeCompact),
      raw: prev.raw,
      bySiteIdentifierRaw: prev.bySiteIdentifierRaw,
      loading: false,
      error: normalizeError(e),
    })
  }
}

export function ensureBuildingsLoaded(siteCode: number) {
  const key = keyFor(siteCode)
  if (inflight.has(key)) return

  const p = doFetch(siteCode, { force: false }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function refreshBuildings(siteCode: number) {
  const key = keyFor(siteCode)
  inflight.delete(key)
  const prev = getSnapshot(key)
  // Keep current data while refreshing; this is the only in-session refresh mechanism.
  setSnapshot(key, { ...prev, loading: true, error: '' })

  const p = doFetch(siteCode, { force: true }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function useBuildingsBySiteCode(siteCode: number, enabled = true) {
  const key = keyFor(siteCode)

  const snap = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getSnapshot(key),
    () => getSnapshot(key),
  )

  useEffect(() => {
    if (!enabled) return
    ensureBuildingsLoaded(siteCode)
  }, [enabled, siteCode])

  const refresh = useCallback(() => {
    refreshBuildings(siteCode)
  }, [siteCode])

  return { ...snap, refresh }
}
