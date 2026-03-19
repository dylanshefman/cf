import {
  ActionIcon,
  Box,
  Collapse,
  Divider,
  Group,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconChevronDown, IconChevronRight, IconTable } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CARMA_TABLES, CF_TABLES, type StandardTableKey } from '../state/dataBank'
import { useDataBank } from '../state/dataBankContext'

function firstAvailableTableKey(bank: ReturnType<typeof useDataBank>['bank']): StandardTableKey | undefined {
  for (const t of CF_TABLES) {
    if (bank.cf[t]) return `cf.${t}`
  }
  for (const t of CARMA_TABLES) {
    if (bank.carma[t]) return `carma.${t}`
  }
  return undefined
}

export function DataSidebar() {
  const { bank } = useDataBank()
  const [searchParams, setSearchParams] = useSearchParams()

  const [expanded, setExpanded] = useState<Set<'cf' | 'carma'>>(() => new Set(['cf', 'carma']))

  const selected = (searchParams.get('table') ?? '') as StandardTableKey

  const cfTables = useMemo(() => {
    return CF_TABLES.map((t) => {
      const data = bank.cf[t]
      return {
        key: `cf.${t}` as const,
        hasData: Boolean(data),
        rows: data?.rows.length ?? 0,
      }
    })
  }, [bank.cf])

  const carmaTables = useMemo(() => {
    return CARMA_TABLES.map((t) => {
      const data = bank.carma[t]
      return {
        key: `carma.${t}` as const,
        hasData: Boolean(data),
        rows: data?.rows.length ?? 0,
      }
    })
  }, [bank.carma])

  useEffect(() => {
    if (searchParams.get('table')) return
    const first = firstAvailableTableKey(bank)
    if (!first) return

    const next = new URLSearchParams(searchParams)
    next.set('table', first)
    setSearchParams(next, { replace: true })
  }, [bank, searchParams, setSearchParams])

  const toggle = (k: 'cf' | 'carma') => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }

  const tableButton = (t: { key: StandardTableKey; hasData: boolean; rows: number }) => {
    const isSelected = selected === t.key

    return (
      <UnstyledButton
        key={t.key}
        onClick={() => {
          const next = new URLSearchParams(searchParams)
          next.set('table', t.key)
          setSearchParams(next)
        }}
        style={{
          padding: 10,
          borderRadius: 10,
          background: isSelected ? 'var(--page-accent-light-bg)' : undefined,
          opacity: t.hasData ? 1 : 0.5,
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
            <IconTable size={16} />
            <Text size="sm" fw={700} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t.key.split('.')[1]}
            </Text>
          </Group>

          {t.hasData ? (
            <Text size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {t.rows.toLocaleString()}
            </Text>
          ) : null}
        </Group>
      </UnstyledButton>
    )
  }

  const section = (label: 'cf' | 'carma', open: boolean, rows: Array<{ key: StandardTableKey; hasData: boolean; rows: number }>) => (
    <Box>
      <Group justify="space-between" wrap="nowrap">
        <Text fw={800} size="sm">
          {label.toUpperCase()}
        </Text>
        <ActionIcon variant="subtle" onClick={() => toggle(label)} aria-label={`Toggle ${label}`}>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </ActionIcon>
      </Group>
      <Collapse in={open}>
        <Stack gap={6} mt={8}>
          {rows.some((r) => r.hasData) ? (
            rows.filter((r) => r.hasData).map(tableButton)
          ) : (
            <Text size="sm" c="dimmed">
              No tables yet
            </Text>
          )}
        </Stack>
      </Collapse>
    </Box>
  )

  return (
    <Stack gap="sm">
      <Text fw={900}>Tables</Text>
      {section('cf', expanded.has('cf'), cfTables)}
      <Divider />
      {section('carma', expanded.has('carma'), carmaTables)}
    </Stack>
  )
}
