import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson } from '../utils/api'

export type SpaceRaw = Record<string, unknown>
export type SpacesRaw = SpaceRaw[]

type Snapshot = {
  data: SpacesRaw | null
  loading: boolean
  error: string
}

const snapshots = new Map<string, Snapshot>()
const listeners = new Map<string, Set<() => void>>()
const inflight = new Map<string, Promise<void>>()

function normalizeBuildingId(buildingId: string): string {
  return buildingId.trim()
}

function normalizeCategory(category: string): string {
  return category.trim()
}

function keyFor(buildingId: string, category: string): string {
  return `${normalizeBuildingId(buildingId)}|${normalizeCategory(category)}`
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
    const current = listeners.get(key)
    if (!current) return
    current.delete(cb)
    if (current.size === 0) listeners.delete(key)
  }
}

function normalizeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function normalizeSpaces(payload: unknown): SpacesRaw {
  if (!Array.isArray(payload)) return []
  return payload.filter((s): s is SpaceRaw => Boolean(s) && typeof s === 'object')
}

async function doFetch(buildingId: string, category: string, opts: { force: boolean }): Promise<void> {
  const normalizedId = normalizeBuildingId(buildingId)
  const normalizedCategory = normalizeCategory(category)
  if (!normalizedId || !normalizedCategory) return

  const key = keyFor(normalizedId, normalizedCategory)

  if (!opts.force) {
    const snap = getSnapshot(key)
    if (snap.loading) return
    if (snap.data !== null) return
    if (snap.error) return
  }

  const p = inflight.get(key)
  if (p) return

  const prev = getSnapshot(key)
  setSnapshot(key, { ...prev, loading: true, error: '' })

  const encBuildingId = encodeURIComponent(normalizedId)
  const encCategory = encodeURIComponent(normalizedCategory)

  // autoPage=1 relies on serverless/cf/api/api/spaces.py forwarding auto_page
  // to KodeSession.list_spaces(auto_page=True).
  const url = `/api/spaces?buildingId=${encBuildingId}&category=${encCategory}&autoPage=1&limit=200`

  const promise = getJson<unknown>(url)
    .then((payload) => {
      const data = normalizeSpaces(payload)
      setSnapshot(key, { data, loading: false, error: '' })
    })
    .catch((e: unknown) => {
      const msg = normalizeError(e)
      setSnapshot(key, { data: null, loading: false, error: msg })
    })
    .finally(() => {
      inflight.delete(key)
    })

  inflight.set(key, promise)
  await promise
}

export function ensureSpacesLoaded(buildingId: string, category: string) {
  void doFetch(buildingId, category, { force: false })
}

export function refreshSpaces(buildingId: string, category: string) {
  void doFetch(buildingId, category, { force: true })
}

export function useSpacesByBuildingIdCategory(buildingId: string, category: string, enabled: boolean) {
  const key = keyFor(buildingId || '', category || '')

  const snapshot = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getSnapshot(key),
    () => getSnapshot(key),
  )

  const refresh = useCallback(() => {
    if (!enabled) return
    if (!buildingId.trim() || !category.trim()) return
    refreshSpaces(buildingId, category)
  }, [buildingId, category, enabled])

  useEffect(() => {
    if (!enabled) return
    if (!buildingId.trim() || !category.trim()) return
    ensureSpacesLoaded(buildingId, category)
  }, [buildingId, category, enabled])

  const ready = snapshot.data !== null || Boolean(snapshot.error)

  return {
    data: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    ready,
    refresh,
  }
}
