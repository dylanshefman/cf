import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { getJson } from '../utils/api'

export type MeterAssignmentRaw = Record<string, unknown>
export type MeterAssignmentsRaw = MeterAssignmentRaw[]

type Snapshot = {
  data: MeterAssignmentsRaw | null
  loading: boolean
  error: string
}

const snapshots = new Map<string, Snapshot>()
const listeners = new Map<string, Set<() => void>>()
const inflight = new Map<string, Promise<void>>()

function normalizeBuildingId(buildingId: string): string {
  return buildingId.trim()
}

function normalizeUploadKey(uploadKey: string): string {
  return uploadKey.trim()
}

function keyFor(buildingId: string, uploadKey: string): string {
  return `${normalizeBuildingId(buildingId)}|${normalizeUploadKey(uploadKey)}`
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
    if (!current.size) listeners.delete(key)
  }
}

function normalizeError(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

function normalizeAssignments(payload: unknown): MeterAssignmentsRaw {
  if (!Array.isArray(payload)) return []
  return payload.filter((a): a is MeterAssignmentRaw => Boolean(a) && typeof a === 'object')
}

async function doFetch(buildingId: string, uploadKey: string, opts: { force: boolean }): Promise<void> {
  const normalizedId = normalizeBuildingId(buildingId)
  const normalizedUploadKey = normalizeUploadKey(uploadKey)
  if (!normalizedId) return

  const key = keyFor(normalizedId, normalizedUploadKey)

  if (!opts.force) {
    const snap = getSnapshot(key)
    if (snap.loading) return
    if (snap.data !== null) return
    if (snap.error) return
  }

  const existing = getSnapshot(key)
  setSnapshot(key, { ...existing, loading: true, error: '' })

  // Note: `spaceCategory` is ignored by the backend now, but keep it for compatibility.
  const url = `/api/meter_assignments?buildingId=${encodeURIComponent(normalizedId)}&autoPage=1&limit=200&spaceCategory=Section`

  try {
    const payload = await getJson<unknown>(url)
    const data = normalizeAssignments(payload)
    const prev = getSnapshot(key)
    setSnapshot(key, { ...prev, data, loading: false, error: '' })
  } catch (e: unknown) {
    const prev = getSnapshot(key)
    setSnapshot(key, {
      ...prev,
      data: prev.data ?? ([] as MeterAssignmentsRaw),
      loading: false,
      error: normalizeError(e),
    })
  }
}

export function ensureMeterAssignmentsLoaded(buildingId: string, uploadKey: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  const normalizedUploadKey = normalizeUploadKey(uploadKey)
  if (!normalizedId) return

  const key = keyFor(normalizedId, normalizedUploadKey)
  if (inflight.has(key)) return

  const p = doFetch(normalizedId, normalizedUploadKey, { force: false }).finally(() => {
    inflight.delete(key)
  })

  inflight.set(key, p)
}

export function refreshMeterAssignments(buildingId: string, uploadKey: string) {
  const normalizedId = normalizeBuildingId(buildingId)
  const normalizedUploadKey = normalizeUploadKey(uploadKey)
  if (!normalizedId) return

  const key = keyFor(normalizedId, normalizedUploadKey)
  if (inflight.has(key)) return

  const p = doFetch(normalizedId, normalizedUploadKey, { force: true }).finally(() => {
    inflight.delete(key)
  })
  inflight.set(key, p)
}

export function useMeterAssignmentsByBuildingId(buildingId: string, enabled: boolean, uploadKey: string) {
  const key = keyFor(buildingId || '', uploadKey || '')

  const snapshot = useSyncExternalStore(
    (cb) => subscribe(key, cb),
    () => getSnapshot(key),
    () => getSnapshot(key),
  )

  const refresh = useCallback(() => {
    if (!enabled) return
    const normalizedId = normalizeBuildingId(buildingId)
    const normalizedUploadKey = normalizeUploadKey(uploadKey)
    if (!normalizedId) return
    refreshMeterAssignments(normalizedId, normalizedUploadKey)
  }, [buildingId, enabled, uploadKey])

  useEffect(() => {
    if (!enabled) return
    const normalizedId = normalizeBuildingId(buildingId)
    const normalizedUploadKey = normalizeUploadKey(uploadKey)
    if (!normalizedId) return
    ensureMeterAssignmentsLoaded(normalizedId, normalizedUploadKey)
  }, [buildingId, enabled, uploadKey])

  const ready = enabled && (snapshot.data !== null || Boolean(snapshot.error))

  return {
    data: snapshot.data,
    loading: snapshot.loading,
    error: snapshot.error,
    ready,
    refresh,
  }
}
