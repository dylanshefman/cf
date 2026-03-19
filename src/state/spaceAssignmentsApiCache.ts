import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson } from '../utils/api'

export type SpaceAssignmentRaw = Record<string, unknown>
export type SpaceAssignmentsRaw = SpaceAssignmentRaw[]

type Snapshot = {
  data: SpaceAssignmentsRaw | null
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

function normalizeAssignments(payload: unknown): SpaceAssignmentsRaw {
  if (!Array.isArray(payload)) return []
  return payload.filter((a): a is SpaceAssignmentRaw => Boolean(a) && typeof a === 'object')
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

  // autoPage=1 relies on serverless/cf/api/api/space_assignments.py forwarding auto_page
  // to KodeSession.list_space_assignments(auto_page=True).
  const url = `/api/space_assignments?buildingId=${encodeURIComponent(normalizedId)}&autoPage=1&limit=200`

  try {
    const payload = await getJson<unknown>(url)
    const data = normalizeAssignments(payload)
    const prev = getSnapshot(key)
    setSnapshot(key, { ...prev, data, loading: false, error: '' })
  } catch (e: unknown) {
    const prev = getSnapshot(key)
    setSnapshot(key, {
      ...prev,
      data: prev.data ?? ([] as SpaceAssignmentsRaw),
      loading: false,
      error: normalizeError(e),
    })
  }
}

export function ensureSpaceAssignmentsLoaded(buildingId: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)
  if (inflight.has(key)) return

  const p = doFetch(normalizedId, { force: false }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function refreshSpaceAssignments(buildingId: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  if (!normalizedId) return

  const key = keyFor(normalizedId)
  inflight.delete(key)

  const prev = getSnapshot(key)
  setSnapshot(key, { ...prev, loading: true, error: '' })

  const p = doFetch(normalizedId, { force: true }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function useSpaceAssignmentsByBuildingId(buildingId: string | null | undefined, enabled = true) {
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
    ensureSpaceAssignmentsLoaded(normalizedId)
  }, [enabled, normalizedId])

  const refresh = useCallback(() => {
    if (!normalizedId) return
    refreshSpaceAssignments(normalizedId)
  }, [normalizedId])

  const ready = snap.data !== null || Boolean(snap.error)

  return { ...snap, ready, refresh }
}
