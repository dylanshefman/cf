import {
  ActionIcon,
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Modal,
  Paper,
  Stack,
  Text,
} from '@mantine/core'
import { useEffect, useMemo, useState } from 'react'
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import type {
  CreateCandidate,
  DeleteCandidate,
  ResolveCandidateBase,
  ResolveConfig,
  ResolveOpKey,
  ResolveRunResult,
  UpdateCandidate,
} from './compareTypes'

const RESOLVE_TOGGLE_COL_W = 34
const RESOLVE_TOGGLE_COL_GAP = 8

function sortByIdentifier<T extends ResolveCandidateBase>(items: T[]): T[] {
  const copy = items.slice()
  copy.sort((a, b) => a.identifier.localeCompare(b.identifier))
  return copy
}

type ResolveDifferencesModalProps<UploadedRow, ApiRow, Ctx> = {
  opened: boolean
  onClose: () => void
  ctx: Ctx
  apiError: boolean
  resolve: ResolveConfig<UploadedRow, ApiRow, Ctx>
  createCandidates: Array<CreateCandidate<UploadedRow>>
  updateCandidates: Array<UpdateCandidate<UploadedRow, ApiRow>>
  deleteCandidates: Array<DeleteCandidate<ApiRow>>
}

export function ResolveDifferencesModal<UploadedRow, ApiRow, Ctx>({
  opened,
  onClose,
  ctx,
  apiError,
  resolve,
  createCandidates,
  updateCandidates,
  deleteCandidates,
}: ResolveDifferencesModalProps<UploadedRow, ApiRow, Ctx>) {
  const [expanded, setExpanded] = useState<Record<ResolveOpKey, boolean>>({
    create: false,
    update: false,
    delete: false,
  })
  const [selected, setSelected] = useState<Record<ResolveOpKey, Set<string>>>(() => ({
    create: new Set<string>(),
    update: new Set<string>(),
    delete: new Set<string>(),
  }))
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runSummary, setRunSummary] = useState<
    | null
    | {
        ok: number
        failed: number
        results: ResolveRunResult[]
      }
  >(null)

  useEffect(() => {
    if (!opened) return
    setRunError(null)
    setRunSummary(null)
    setExpanded({ create: false, update: false, delete: false })
    setSelected({ create: new Set(), update: new Set(), delete: new Set() })
  }, [opened])

  const sortedCreate = useMemo(() => sortByIdentifier(createCandidates), [createCandidates])
  const sortedUpdate = useMemo(() => sortByIdentifier(updateCandidates), [updateCandidates])
  const sortedDelete = useMemo(() => sortByIdentifier(deleteCandidates), [deleteCandidates])

  const enabledCreateKeys = useMemo(() => {
    return new Set(sortedCreate.filter((c) => !c.disabledReason).map((c) => c.key))
  }, [sortedCreate])

  const enabledUpdateKeys = useMemo(() => {
    return new Set(sortedUpdate.filter((c) => !c.disabledReason).map((c) => c.key))
  }, [sortedUpdate])

  const enabledDeleteKeys = useMemo(() => {
    return new Set(sortedDelete.filter((c) => !c.disabledReason).map((c) => c.key))
  }, [sortedDelete])

  const hasResolvableDiffs = sortedCreate.length > 0 || sortedUpdate.length > 0 || sortedDelete.length > 0

  const selectedCounts = useMemo(() => {
    const selectedCreateEnabled = Array.from(selected.create).filter((k) => enabledCreateKeys.has(k)).length
    const selectedUpdateEnabled = Array.from(selected.update).filter((k) => enabledUpdateKeys.has(k)).length
    const selectedDeleteEnabled = Array.from(selected.delete).filter((k) => enabledDeleteKeys.has(k)).length
    return {
      create: selectedCreateEnabled,
      update: selectedUpdateEnabled,
      delete: selectedDeleteEnabled,
    }
  }, [enabledCreateKeys, enabledDeleteKeys, enabledUpdateKeys, selected.create, selected.delete, selected.update])

  const selectedTotal = selectedCounts.create + selectedCounts.update + selectedCounts.delete

  const canRunError = useMemo(() => {
    const msg = resolve.validateBeforeRun?.(ctx) ?? null
    return msg
  }, [ctx, resolve])

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (running) return
        onClose()
      }}
      title="Resolve differences"
      size="xl"
      styles={{
        body: {
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          overflow: 'hidden',
        },
      }}
    >
      {!hasResolvableDiffs ? (
        <Text size="sm" c="dimmed">
          No differences to resolve.
        </Text>
      ) : (
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          <Box style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 6 }}>
            <Stack gap="md">
              {runError && (
                <Text size="sm" c="red">
                  {runError}
                </Text>
              )}

              {runSummary && (
                <Text size="sm" c={runSummary.failed ? 'red' : 'dimmed'}>
                  {runSummary.failed
                    ? `Completed with ${runSummary.failed} error(s). ${runSummary.ok} succeeded.`
                    : `Completed. ${runSummary.ok} succeeded.`}
                </Text>
              )}

          {resolve.create && sortedCreate.length > 0 && (
            <Paper withBorder p="sm" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap={8} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Box style={{ width: RESOLVE_TOGGLE_COL_W, display: 'flex', justifyContent: 'center' }}>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setExpanded((p) => ({ ...p, create: !p.create }))}
                        aria-label={expanded.create ? 'Collapse create list' : 'Expand create list'}
                      >
                        {expanded.create ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      </ActionIcon>
                    </Box>
                    <Checkbox
                      checked={enabledCreateKeys.size > 0 && selectedCounts.create === enabledCreateKeys.size}
                      indeterminate={selectedCounts.create > 0 && selectedCounts.create < enabledCreateKeys.size}
                      disabled={enabledCreateKeys.size === 0}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked
                        setSelected((prev) => {
                          const next = { ...prev }
                          next.create = checked ? new Set(Array.from(enabledCreateKeys)) : new Set()
                          return next
                        })
                      }}
                      label={
                        <Text fw={900} size="md">
                          {resolve.create!.label}
                        </Text>
                      }
                    />
                  </Group>
                  <Text size="xs" c="dimmed">
                    {selectedCounts.create}/{sortedCreate.length} selected
                  </Text>
                </Group>

                <Collapse in={expanded.create}>
                  <Box style={{ paddingLeft: RESOLVE_TOGGLE_COL_W + RESOLVE_TOGGLE_COL_GAP }}>
                    <Stack gap={6}>
                      {sortedCreate.map((c) => (
                        <Checkbox
                          key={c.key}
                          checked={selected.create.has(c.key)}
                          disabled={Boolean(c.disabledReason)}
                          onChange={(e) => {
                            if (c.disabledReason) return
                            const checked = e.currentTarget.checked
                            setSelected((prev) => {
                              const next = { ...prev, create: new Set(prev.create) }
                              if (checked) next.create.add(c.key)
                              else next.create.delete(c.key)
                              return next
                            })
                          }}
                          label={
                            <Group gap={10} wrap="nowrap">
                              <Text fw={800} size="sm">
                                {c.identifier}
                              </Text>
                              <Text size="sm" fw={400} c="dimmed" lineClamp={1}>
                                {c.secondaryText || '(no name)'}
                              </Text>
                              {c.disabledReason && (
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {c.disabledReason}
                                </Text>
                              )}
                            </Group>
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </Stack>
            </Paper>
          )}

          {resolve.update && sortedUpdate.length > 0 && (
            <Paper withBorder p="sm" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap={8} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Box style={{ width: RESOLVE_TOGGLE_COL_W, display: 'flex', justifyContent: 'center' }}>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setExpanded((p) => ({ ...p, update: !p.update }))}
                        aria-label={expanded.update ? 'Collapse update list' : 'Expand update list'}
                      >
                        {expanded.update ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      </ActionIcon>
                    </Box>
                    <Checkbox
                      checked={enabledUpdateKeys.size > 0 && selectedCounts.update === enabledUpdateKeys.size}
                      indeterminate={selectedCounts.update > 0 && selectedCounts.update < enabledUpdateKeys.size}
                      disabled={enabledUpdateKeys.size === 0}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked
                        setSelected((prev) => {
                          const next = { ...prev }
                          next.update = checked ? new Set(Array.from(enabledUpdateKeys)) : new Set()
                          return next
                        })
                      }}
                      label={
                        <Text fw={900} size="md">
                          {resolve.update!.label}
                        </Text>
                      }
                    />
                  </Group>
                  <Text size="xs" c="dimmed">
                    {selectedCounts.update}/{sortedUpdate.length} selected
                  </Text>
                </Group>

                <Collapse in={expanded.update}>
                  <Box style={{ paddingLeft: RESOLVE_TOGGLE_COL_W + RESOLVE_TOGGLE_COL_GAP }}>
                    <Stack gap={6}>
                      {sortedUpdate.map((c) => (
                        <Checkbox
                          key={c.key}
                          checked={selected.update.has(c.key)}
                          disabled={Boolean(c.disabledReason)}
                          onChange={(e) => {
                            if (c.disabledReason) return
                            const checked = e.currentTarget.checked
                            setSelected((prev) => {
                              const next = { ...prev, update: new Set(prev.update) }
                              if (checked) next.update.add(c.key)
                              else next.update.delete(c.key)
                              return next
                            })
                          }}
                          label={
                            <Group gap={10} wrap="nowrap">
                              <Text fw={800} size="sm">
                                {c.identifier}
                              </Text>
                              <Text size="sm" fw={400} c="dimmed" lineClamp={1}>
                                {c.secondaryText || '(no name)'}
                              </Text>
                              {c.disabledReason && (
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {c.disabledReason}
                                </Text>
                              )}
                            </Group>
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </Stack>
            </Paper>
          )}

          {resolve.delete && sortedDelete.length > 0 && (
            <Paper withBorder p="sm" radius="md">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Group gap={8} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                    <Box style={{ width: RESOLVE_TOGGLE_COL_W, display: 'flex', justifyContent: 'center' }}>
                      <ActionIcon
                        variant="subtle"
                        onClick={() => setExpanded((p) => ({ ...p, delete: !p.delete }))}
                        aria-label={expanded.delete ? 'Collapse delete list' : 'Expand delete list'}
                      >
                        {expanded.delete ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      </ActionIcon>
                    </Box>
                    <Checkbox
                      checked={enabledDeleteKeys.size > 0 && selectedCounts.delete === enabledDeleteKeys.size}
                      indeterminate={selectedCounts.delete > 0 && selectedCounts.delete < enabledDeleteKeys.size}
                      disabled={enabledDeleteKeys.size === 0}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked
                        setSelected((prev) => {
                          const next = { ...prev }
                          next.delete = checked ? new Set(Array.from(enabledDeleteKeys)) : new Set()
                          return next
                        })
                      }}
                      label={
                        <Text fw={900} size="md">
                          {resolve.delete!.label}
                        </Text>
                      }
                    />
                  </Group>
                  <Text size="xs" c="dimmed">
                    {selectedCounts.delete}/{sortedDelete.length} selected
                  </Text>
                </Group>

                <Collapse in={expanded.delete}>
                  <Box style={{ paddingLeft: RESOLVE_TOGGLE_COL_W + RESOLVE_TOGGLE_COL_GAP }}>
                    <Stack gap={6}>
                      {sortedDelete.map((c) => (
                        <Checkbox
                          key={c.key}
                          checked={selected.delete.has(c.key)}
                          disabled={Boolean(c.disabledReason)}
                          onChange={(e) => {
                            if (c.disabledReason) return
                            const checked = e.currentTarget.checked
                            setSelected((prev) => {
                              const next = { ...prev, delete: new Set(prev.delete) }
                              if (checked) next.delete.add(c.key)
                              else next.delete.delete(c.key)
                              return next
                            })
                          }}
                          label={
                            <Group gap={10} wrap="nowrap">
                              <Text fw={800} size="sm">
                                {c.identifier}
                              </Text>
                              <Text size="sm" fw={400} c="dimmed" lineClamp={1}>
                                {c.secondaryText || '(no name)'}
                              </Text>
                              {c.disabledReason && (
                                <Text size="xs" c="dimmed" lineClamp={1}>
                                  {c.disabledReason}
                                </Text>
                              )}
                            </Group>
                          }
                        />
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </Stack>
            </Paper>
          )}

            </Stack>
          </Box>

          <Group justify="space-between" align="center" wrap="nowrap" style={{ flex: '0 0 auto' }}>
            <Text size="sm" c="dimmed">
              {selectedTotal} selected
            </Text>

            <Group gap="sm" wrap="nowrap">
              <Button variant="default" onClick={onClose} disabled={running}>
                Cancel
              </Button>

              <Button
                onClick={async () => {
                if (running) return
                setRunError(null)
                setRunSummary(null)

                if (apiError) {
                  setRunError('Cannot resolve differences while API is in error state.')
                  return
                }

                if (canRunError) {
                  setRunError(canRunError)
                  return
                }

                if (selectedTotal === 0) {
                  setRunError('Select at least one operation to run.')
                  return
                }

                setRunning(true)
                try {
                  const results: ResolveRunResult[] = []

                  if (resolve.create) {
                    for (const c of sortedCreate) {
                      if (c.disabledReason) continue
                      if (!selected.create.has(c.key)) continue
                      try {
                        await resolve.create.run({ identifier: c.identifier, uploadedRow: c.uploadedRow, ctx })
                        results.push({ op: 'create', identifier: c.identifier, status: 'ok' })
                      } catch (e) {
                        results.push({
                          op: 'create',
                          identifier: c.identifier,
                          status: 'error',
                          message: e instanceof Error ? e.message : String(e),
                        })
                      }
                    }
                  }

                  if (resolve.update) {
                    for (const c of sortedUpdate) {
                      if (c.disabledReason) continue
                      if (!selected.update.has(c.key)) continue
                      try {
                        await resolve.update.run({
                          identifier: c.identifier,
                          uploadedRow: c.uploadedRow,
                          apiRow: c.apiRow,
                          apiMutationId: c.apiMutationId,
                          ctx,
                        })
                        results.push({ op: 'update', identifier: c.identifier, status: 'ok' })
                      } catch (e) {
                        results.push({
                          op: 'update',
                          identifier: c.identifier,
                          status: 'error',
                          message: e instanceof Error ? e.message : String(e),
                        })
                      }
                    }
                  }

                  if (resolve.delete) {
                    for (const c of sortedDelete) {
                      if (c.disabledReason) continue
                      if (!selected.delete.has(c.key)) continue
                      try {
                        await resolve.delete.run({
                          identifier: c.identifier,
                          apiRow: c.apiRow,
                          apiMutationId: c.apiMutationId,
                          ctx,
                        })
                        results.push({ op: 'delete', identifier: c.identifier, status: 'ok' })
                      } catch (e) {
                        results.push({
                          op: 'delete',
                          identifier: c.identifier,
                          status: 'error',
                          message: e instanceof Error ? e.message : String(e),
                        })
                      }
                    }
                  }

                  const ok = results.filter((r) => r.status === 'ok').length
                  const failed = results.filter((r) => r.status === 'error').length
                  setRunSummary({ ok, failed, results })

                  try {
                    resolve.onComplete?.()
                  } catch {
                    // ignore
                  }

                  if (failed === 0) {
                    onClose()
                  }
                } catch (e) {
                  setRunError(e instanceof Error ? e.message : String(e))
                } finally {
                  setRunning(false)
                }
                }}
                loading={running}
                disabled={running || apiError || Boolean(canRunError) || selectedTotal === 0}
                styles={{
                  root: {
                    backgroundImage: 'var(--page-accent-bg)',
                  },
                }}
              >
                Run selected operations
              </Button>
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}
