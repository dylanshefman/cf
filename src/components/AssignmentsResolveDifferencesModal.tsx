import {
  ActionIcon,
  Badge,
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
import { IconAlertTriangle, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import type { ResolveCandidateBase, ResolveOpKey } from './compare/compareTypes'

const RESOLVE_TOGGLE_COL_W = 34
const RESOLVE_TOGGLE_COL_GAP = 8

export type MultiResolveSection<Candidate extends ResolveCandidateBase> = {
  key: string
  op: ResolveOpKey
  label: string
  error?: string | null
  candidates: Candidate[]
  run: (candidate: Candidate) => Promise<void>
}

export type MultiResolveRunResult = {
  sectionKey: string
  op: ResolveOpKey
  identifier: string
  status: 'ok' | 'error'
  message?: string
}

export type AssignmentsResolveDifferencesModalProps = {
  opened: boolean
  onClose: () => void
  title?: string
  sections: Array<MultiResolveSection<any>>
}

function sortByIdentifier<T extends ResolveCandidateBase>(items: T[]): T[] {
  const copy = items.slice()
  copy.sort((a, b) => a.identifier.localeCompare(b.identifier))
  return copy
}

export function AssignmentsResolveDifferencesModal({
  opened,
  onClose,
  title = 'Resolve differences',
  sections,
}: AssignmentsResolveDifferencesModalProps) {
  const normalizedSections = useMemo(() => {
    return sections.map((s) => ({
      ...s,
      candidates: sortByIdentifier(s.candidates ?? []),
    }))
  }, [sections])

  const orderedGroups = useMemo(() => {
    const byKey = new Map(normalizedSections.map((s) => [s.key, s] as const))

    const tenantOrder = ['ts-add', 'ts-patch', 'ts-delete']
    const meterOrder = ['ms-add', 'ms-delete']

    const tenant = tenantOrder.map((k) => byKey.get(k)).filter(Boolean) as Array<MultiResolveSection<any>>
    const meter = meterOrder.map((k) => byKey.get(k)).filter(Boolean) as Array<MultiResolveSection<any>>

    const used = new Set<string>([...tenant, ...meter].map((s) => s.key))
    const other = normalizedSections.filter((s) => !used.has(s.key))

    const groups: Array<{ label: string; sections: Array<MultiResolveSection<any>> }> = [
      { label: 'Tenant ↔ Space', sections: tenant },
      { label: 'Meter ↔ Space', sections: meter },
    ]

    if (other.length > 0) {
      groups.push({ label: 'Other', sections: other })
    }

    return groups
  }, [normalizedSections])

  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [selected, setSelected] = useState<Record<string, Set<string>>>({})
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState<string | null>(null)
  const [runSummary, setRunSummary] = useState<
    | null
    | {
        ok: number
        failed: number
        results: MultiResolveRunResult[]
      }
  >(null)

  useEffect(() => {
    if (!opened) return
    setRunError(null)
    setRunSummary(null)

    const nextExpanded: Record<string, boolean> = {}
    const nextSelected: Record<string, Set<string>> = {}
    for (const s of normalizedSections) {
      nextExpanded[s.key] = false
      nextSelected[s.key] = new Set<string>()
    }
    setExpanded(nextExpanded)
    setSelected(nextSelected)
  }, [opened, normalizedSections])

  const enabledKeysBySection = useMemo(() => {
    const out: Record<string, Set<string>> = {}
    for (const s of normalizedSections) {
      const enabled = new Set<string>()
      for (const c of s.candidates) {
        if (c.disabledReason) continue
        enabled.add(c.key)
      }
      out[s.key] = enabled
    }
    return out
  }, [normalizedSections])

  const selectedCountsBySection = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of normalizedSections) {
      const enabled = enabledKeysBySection[s.key] ?? new Set<string>()
      const chosen = selected[s.key] ?? new Set<string>()
      out[s.key] = Array.from(chosen).filter((k) => enabled.has(k)).length
    }
    return out
  }, [enabledKeysBySection, normalizedSections, selected])

  const selectedTotal = useMemo(() => {
    return Object.values(selectedCountsBySection).reduce((a, b) => a + b, 0)
  }, [selectedCountsBySection])

  const anyResolvable = useMemo(() => {
    return normalizedSections.some((s) => (s.candidates?.length ?? 0) > 0)
  }, [normalizedSections])

  const hasApiErrors = useMemo(() => {
    return normalizedSections.some((s) => Boolean(s.error))
  }, [normalizedSections])

  const runSelected = async () => {
    if (running) return

    const work: Array<{ section: MultiResolveSection<any>; candidate: ResolveCandidateBase }> = []
    for (const s of normalizedSections) {
      const chosen = selected[s.key] ?? new Set<string>()
      if (!chosen.size) continue
      const byKey = new Map(s.candidates.map((c: ResolveCandidateBase) => [c.key, c]))
      for (const k of chosen) {
        const c = byKey.get(k)
        if (!c) continue
        if (c.disabledReason) continue
        work.push({ section: s, candidate: c })
      }
    }

    if (!work.length) return

    setRunning(true)
    setRunError(null)
    setRunSummary(null)

    const results: MultiResolveRunResult[] = []

    for (const item of work) {
      try {
        await item.section.run(item.candidate)
        results.push({
          sectionKey: item.section.key,
          op: item.section.op,
          identifier: item.candidate.identifier,
          status: 'ok',
        })
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        results.push({
          sectionKey: item.section.key,
          op: item.section.op,
          identifier: item.candidate.identifier,
          status: 'error',
          message: msg,
        })
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length
    const failed = results.length - ok

    setRunSummary({ ok, failed, results })
    setRunning(false)
  }

  return (
    <Modal
      opened={opened}
      onClose={() => {
        if (running) return
        onClose()
      }}
      title={title}
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
      <Stack gap="sm" style={{ flex: 1, minHeight: 0 }}>
        {hasApiErrors && (
          <Paper withBorder p="sm" radius="md" style={{ borderColor: 'var(--mantine-color-red-outline)' }}>
            <Group gap="xs" wrap="nowrap">
              <IconAlertTriangle size={16} />
              <Text size="sm">Some API data failed to load. You can still run safe operations.</Text>
            </Group>
          </Paper>
        )}

        <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
          <Stack gap="md">
            {orderedGroups
              .filter((g) => g.sections.length > 0)
              .map((group) => (
                <Stack key={group.label} gap="xs">
                  <Text fw={900} size="sm">
                    {group.label}
                  </Text>

                  {group.sections.map((s) => {
                    const expandedNow = Boolean(expanded[s.key])
                    const enabledKeys = enabledKeysBySection[s.key] ?? new Set<string>()
                    const selectedCount = selectedCountsBySection[s.key] ?? 0
                    const total = s.candidates.length

                    return (
                      <Paper key={s.key} withBorder p="sm" radius="md">
                        <Group justify="space-between" wrap="nowrap" gap="sm">
                          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
                            <ActionIcon
                              variant="subtle"
                              onClick={() => {
                                setExpanded((prev) => ({ ...prev, [s.key]: !prev[s.key] }))
                              }}
                              aria-label={expandedNow ? 'Collapse' : 'Expand'}
                              disabled={total === 0}
                            >
                              {expandedNow ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                            </ActionIcon>

                            <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                              <Group gap="xs" wrap="nowrap">
                                <Text fw={800} size="sm" style={{ whiteSpace: 'nowrap' }}>
                                  {s.label}
                                </Text>
                                <Badge variant="light" color={s.op === 'create' ? 'green' : s.op === 'delete' ? 'red' : 'blue'}>
                                  {s.op}
                                </Badge>
                              </Group>

                              <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {total} candidate{total === 1 ? '' : 's'}
                                {selectedCount ? ` • ${selectedCount} selected` : ''}
                                {s.error ? ` • ${s.error}` : ''}
                              </Text>
                            </Stack>
                          </Group>

                          <Group gap={RESOLVE_TOGGLE_COL_GAP} wrap="nowrap">
                            <Checkbox
                              checked={selectedCount > 0 && selectedCount === enabledKeys.size}
                              indeterminate={selectedCount > 0 && selectedCount < enabledKeys.size}
                              disabled={enabledKeys.size === 0}
                              onChange={(e) => {
                                const checked = e.currentTarget.checked
                                setSelected((prev) => {
                                  const next = { ...prev }
                                  next[s.key] = checked ? new Set(enabledKeys) : new Set()
                                  return next
                                })
                              }}
                              aria-label="Select all"
                            />
                          </Group>
                        </Group>

                        <Collapse in={expandedNow} transitionDuration={220}>
                          <Box pt="sm">
                            <Stack gap={6}>
                              {s.candidates.map((c: ResolveCandidateBase) => {
                                const enabled = !c.disabledReason
                                const isSelected = Boolean(selected[s.key]?.has(c.key))
                                return (
                                  <Group key={c.key} wrap="nowrap" gap={RESOLVE_TOGGLE_COL_GAP} align="flex-start">
                                    <Box style={{ width: RESOLVE_TOGGLE_COL_W, paddingTop: 2 }}>
                                      <Checkbox
                                        checked={isSelected}
                                        disabled={!enabled}
                                        onChange={(e) => {
                                          const checked = e.currentTarget.checked
                                          setSelected((prev) => {
                                            const next = { ...prev }
                                            const set = new Set(next[s.key] ?? [])
                                            if (checked) set.add(c.key)
                                            else set.delete(c.key)
                                            next[s.key] = set
                                            return next
                                          })
                                        }}
                                        aria-label={c.identifier}
                                      />
                                    </Box>

                                    <Paper
                                      withBorder
                                      radius="sm"
                                      p="xs"
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        opacity: enabled ? 1 : 0.7,
                                      }}
                                    >
                                      <Stack gap={2}>
                                        <Group justify="space-between" wrap="nowrap" gap="sm">
                                          <Text fw={800} size="sm" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {c.identifier}
                                          </Text>
                                        </Group>

                                        <Text size="xs" c="dimmed">
                                          {c.secondaryText}
                                        </Text>

                                        {c.disabledReason && (
                                          <Text size="xs" c="red">
                                            {c.disabledReason}
                                          </Text>
                                        )}
                                      </Stack>
                                    </Paper>
                                  </Group>
                                )
                              })}
                            </Stack>
                          </Box>
                        </Collapse>
                      </Paper>
                    )
                  })}
                </Stack>
              ))}
          </Stack>
        </Box>

        {runError && (
          <Text size="sm" c="red">
            {runError}
          </Text>
        )}

        {runSummary && (
          <Paper withBorder p="sm" radius="md">
            <Text fw={800} size="sm">
              Summary
            </Text>
            <Text size="sm" c="dimmed">
              {runSummary.ok} succeeded • {runSummary.failed} failed
            </Text>
          </Paper>
        )}

        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed">
            {anyResolvable ? `${selectedTotal} selected` : 'No resolvable differences.'}
          </Text>

          <Group gap="sm" wrap="nowrap">
            <Button variant="default" onClick={onClose} disabled={running}>
              Close
            </Button>
            <Button
              onClick={() => {
                void runSelected()
              }}
              disabled={running || selectedTotal === 0}
              loading={running}
            >
              Run selected
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  )
}
