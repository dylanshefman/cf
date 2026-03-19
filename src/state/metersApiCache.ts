import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson } from '../utils/api'

export type MeterRaw = Record<string, unknown>
export type MetersRaw = MeterRaw[]

type Snapshot = {
  data: MetersRaw | null
  loading: boolean
  error: string
}

const snapshots = new Map<string, Snapshot>()
const listeners = new Map<string, Set<() => void>>()
const inflight = new Map<string, Promise<void>>()

function normalizeBuildingId(buildingId: string): string {
  return buildingId.trim()
}

function keyFor(buildingId: string): string {
  return normalizeBuildingId(buildingId)
}

function getSnapshot(key: string): Snapshot {
  const existing = snapshots.get(key)
  if (existing) return existing

  const initial: Snapshot = {
    data: null,
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

function normalizeMeters(payload: unknown): MetersRaw {
  if (!Array.isArray(payload)) return []
  return payload.filter((m): m is MeterRaw => Boolean(m) && typeof m === 'object')
}

async function doFetch(buildingId: string, opts: { force: boolean }): Promise<void> {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)

  if (!opts.force) {
    const snap = getSnapshot(key)
    if (snap.loading) return
    if (snap.data !== null) return
    if (snap.error) return
  }

  const existing = getSnapshot(key)
  setSnapshot(key, { ...existing, loading: true, error: '' })

  const url = `/api/meters?buildingId=${encodeURIComponent(normalizedId)}&autoPage=1&limit=200&compact=1`

  try {
    const payload = await getJson<unknown>(url)
    const data = normalizeMeters(payload)
    const prev = getSnapshot(key)
    setSnapshot(key, { ...prev, data, loading: false, error: '' })
  } catch (e: unknown) {
    const prev = getSnapshot(key)
    setSnapshot(key, {
      ...prev,
      data: prev.data ?? ([] as MetersRaw),
      loading: false,
      error: normalizeError(e),
    })
  }
}

export function ensureMetersLoaded(buildingId: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)
  if (inflight.has(key)) return

  const p = doFetch(normalizedId, { force: false }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function refreshMeters(buildingId: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)
  if (inflight.has(key)) return

  const p = doFetch(normalizedId, { force: true }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function useMetersByBuildingId(buildingId: string, enabled: boolean) {
  const key = keyFor(buildingId || '')

  const snapshot = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getSnapshot(key),
    () => getSnapshot(key),
  )

  const refresh = useCallback(() => {
    if (!enabled) return
    const normalizedId = normalizeBuildingId(buildingId)
    if (!normalizedId) return
    refreshMeters(normalizedId)
  }, [buildingId, enabled])

  useEffect(() => {
    if (!enabled) return
    const normalizedId = normalizeBuildingId(buildingId)
    if (!normalizedId) return
    ensureMetersLoaded(normalizedId)
  }, [buildingId, enabled])

  const ready = enabled && (snapshot.data !== null || Boolean(snapshot.error))

  return {
    data: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    ready,
    refresh,
  }
}
