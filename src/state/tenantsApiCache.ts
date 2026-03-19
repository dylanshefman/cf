import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson } from '../utils/api'

export type TenantRaw = Record<string, unknown>
export type TenantsRaw = TenantRaw[]

type Snapshot = {
  data: TenantsRaw | null
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

  // Important: useSyncExternalStore requires getSnapshot() to be referentially stable
  // when nothing changed. Store a per-key initial snapshot so we don't create a new
  // object on every call.
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

function normalizeTenants(payload: unknown): TenantsRaw {
  if (!Array.isArray(payload)) return []
  return payload.filter((t): t is TenantRaw => Boolean(t) && typeof t === 'object')
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

  const url = `/api/tenants?buildingId=${encodeURIComponent(normalizedId)}`

  try {
    const payload = await getJson<unknown>(url)
    const data = normalizeTenants(payload)
    const prev = getSnapshot(key)
    setSnapshot(key, { ...prev, data, loading: false, error: '' })
  } catch (e: unknown) {
    const prev = getSnapshot(key)
    setSnapshot(key, {
      ...prev,
      data: prev.data ?? ([] as TenantsRaw),
      loading: false,
      error: normalizeError(e),
    })
  }
}

export function ensureTenantsLoaded(buildingId: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)
  if (inflight.has(key)) return

  const p = doFetch(normalizedId, { force: false }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function refreshTenants(buildingId: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)
  inflight.delete(key)

  const prev = getSnapshot(key)
  // Keep current data while refreshing; this is the only in-session refresh mechanism.
  setSnapshot(key, { ...prev, loading: true, error: '' })

  const p = doFetch(normalizedId, { force: true }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function useTenantsByBuildingId(buildingId: string | null | undefined, enabled = true) {
  const normalizedId = normalizeBuildingId(buildingId ?? '')
  const key = keyFor(normalizedId)

  const snap = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getSnapshot(key),
    () => getSnapshot(key),
  )

  useEffect(() => {
    if (!enabled) return
    if (!normalizedId) return
    ensureTenantsLoaded(normalizedId)
  }, [enabled, normalizedId])

  const refresh = useCallback(() => {
    if (!normalizedId) return
    refreshTenants(normalizedId)
  }, [normalizedId])

  return { ...snap, refresh }
}
