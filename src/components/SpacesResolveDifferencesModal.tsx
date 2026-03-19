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

export type SpacesResolveDifferencesModalProps = {
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

export function SpacesResolveDifferencesModal({
  opened,
  onClose,
  title = 'Resolve differences',
  sections,
}: SpacesResolveDifferencesModalProps) {
  const normalizedSections = useMemo(() => {
    return sections.map((s) => ({
      ...s,
      candidates: sortByIdentifier(s.candidates ?? []),
    }))
  }, [sections])

  const orderedGroups = useMemo(() => {
    const byKey = new Map(normalizedSections.map((s) => [s.key, s] as const))

    const floorOrder = ['add-floors', 'delete-floors']
    const unitOrder = ['add-units', 'patch-units', 'delete-units']

    const floors = floorOrder.map((k) => byKey.get(k)).filter(Boolean) as Array<MultiResolveSection<any>>
    const units = unitOrder.map((k) => byKey.get(k)).filter(Boolean) as Array<MultiResolveSection<any>>

    const used = new Set<string>([...floors, ...units].map((s) => s.key))
    const other = normalizedSections.filter((s) => !used.has(s.key))

    const groups: Array<{ label: string; sections: Array<MultiResolveSection<any>> }> = [
      { label: 'Floors', sections: floors },
      { label: 'Units', sections: units },
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
        if (!c.disabledReason) enabled.add(c.key)
      }
      out[s.key] = enabled
    }
    return out
  }, [normalizedSections])

  const selectedCountsBySection = useMemo(() => {
    const out: Record<string, number> = {}
    for (const s of normalizedSections) {
      const enabled = enabledKeysBySection[s.key] ?? new Set<string>()
      const current = selected[s.key] ?? new Set<string>()
      out[s.key] = Array.from(current).filter((k) => enabled.has(k)).length
    }
    return out
  }, [enabledKeysBySection, normalizedSections, selected])

  const selectedTotal = useMemo(() => {
    return Object.values(selectedCountsBySection).reduce((a, b) => a + b, 0)
  }, [selectedCountsBySection])

  const hasAnyCandidates = normalizedSections.some((s) => (s.candidates?.length ?? 0) > 0)

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
      {!hasAnyCandidates ? (
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

          {orderedGroups.map((group) => {
            if (group.sections.length === 0) return null

            return (
              <Stack key={group.label} gap="xs">
                <Text fw={900} size="sm">
                  {group.label}
                </Text>

                {group.sections.map((section) => {
                  const enabledKeys = enabledKeysBySection[section.key] ?? new Set<string>()
                  const selectedCount = selectedCountsBySection[section.key] ?? 0
                  const total = section.candidates.length
                  const isDisabledByError = Boolean(section.error)

                  return (
                    <Paper key={section.key} withBorder p="sm" radius="md">
                      <Stack gap="sm">
                        <Group justify="space-between" align="center">
                          <Group gap={8} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                            <Box style={{ width: RESOLVE_TOGGLE_COL_W, display: 'flex', justifyContent: 'center' }}>
                              <ActionIcon
                                variant="subtle"
                                onClick={() => setExpanded((p) => ({ ...p, [section.key]: !p[section.key] }))}
                                aria-label={expanded[section.key] ? `Collapse ${section.label}` : `Expand ${section.label}`}
                              >
                                {expanded[section.key] ? (
                                  <IconChevronDown size={16} />
                                ) : (
                                  <IconChevronRight size={16} />
                                )}
                              </ActionIcon>
                            </Box>

                            <Checkbox
                              checked={enabledKeys.size > 0 && selectedCount === enabledKeys.size}
                              indeterminate={selectedCount > 0 && selectedCount < enabledKeys.size}
                              disabled={enabledKeys.size === 0 || isDisabledByError}
                              onChange={(e) => {
                                const checked = e.currentTarget.checked
                                setSelected((prev) => {
                                  const next = { ...prev }
                                  next[section.key] = checked ? new Set(Array.from(enabledKeys)) : new Set()
                                  return next
                                })
                              }}
                              label={
                                <Group gap={10} wrap="nowrap">
                                  <Text fw={900} size="md">
                                    {section.label}
                                  </Text>

                                  {isDisabledByError && (
                                    <Badge color="red" leftSection={<IconAlertTriangle size={14} />} variant="filled">
                                      API error
                                    </Badge>
                                  )}
                                </Group>
                              }
                            />
                          </Group>

                          <Text size="xs" c="dimmed">
                            {selectedCount}/{total} selected
                          </Text>
                        </Group>

                        {section.error && (
                          <Text size="sm" c="dimmed">
                            {section.error}
                          </Text>
                        )}

                        <Collapse in={Boolean(expanded[section.key])}>
                          <Box style={{ paddingLeft: RESOLVE_TOGGLE_COL_W + RESOLVE_TOGGLE_COL_GAP }}>
                            <Stack gap={6}>
                              {section.candidates.map((c: ResolveCandidateBase) => (
                                <Checkbox
                                  key={c.key}
                                  checked={Boolean(selected[section.key]?.has(c.key))}
                                  disabled={Boolean(c.disabledReason) || isDisabledByError}
                                  onChange={(e) => {
                                    if (c.disabledReason || isDisabledByError) return
                                    const checked = e.currentTarget.checked
                                    setSelected((prev) => {
                                      const next = { ...prev, [section.key]: new Set(prev[section.key] ?? []) }
                                      if (checked) next[section.key].add(c.key)
                                      else next[section.key].delete(c.key)
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
                  )
                })}
              </Stack>
            )
          })}

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

                if (selectedTotal === 0) {
                  setRunError('Select at least one operation to run.')
                  return
                }

                setRunning(true)
                try {
                  const results: MultiResolveRunResult[] = []

                  for (const section of normalizedSections) {
                    if (section.error) continue

                    const chosen = selected[section.key] ?? new Set<string>()
                    for (const candidate of section.candidates) {
                      if (candidate.disabledReason) continue
                      if (!chosen.has(candidate.key)) continue

                      try {
                        await section.run(candidate)
                        results.push({
                          sectionKey: section.key,
                          op: section.op,
                          identifier: candidate.identifier,
                          status: 'ok',
                        })
                      } catch (e) {
                        results.push({
                          sectionKey: section.key,
                          op: section.op,
                          identifier: candidate.identifier,
                          status: 'error',
                          message: e instanceof Error ? e.message : String(e),
                        })
                      }
                    }
                  }

                  const ok = results.filter((r) => r.status === 'ok').length
                  const failed = results.filter((r) => r.status === 'error').length
                  setRunSummary({ ok, failed, results })

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
                disabled={running || selectedTotal === 0}
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
