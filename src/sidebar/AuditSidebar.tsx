import {
  Box,
  Divider,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from '@mantine/core'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDataBank } from '../state/dataBankContext'
import { useBuildingsBySiteCode } from '../state/buildingsApiCache'

type PropertyRow = {
  code: string
  name: string
}

function normalizeCode(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  return String(value).trim()
}

export function AuditSidebar() {
  const { bank } = useDataBank()
  const propertyTable = bank.cf.property

  const [searchParams, setSearchParams] = useSearchParams()
  const selected = searchParams.get('property') ?? 'overview'

  const { data: buildingsBySiteCode, loading } = useBuildingsBySiteCode(1, Boolean(propertyTable))

  const properties = useMemo<PropertyRow[]>(() => {
    if (!propertyTable) return []

    const out: PropertyRow[] = []
    const seen = new Set<string>()

    for (const row of propertyTable.rows) {
      const code = normalizeCode(row.PROPERTY_CODE)
      if (!code) continue
      if (seen.has(code)) continue

      const name = normalizeCode(row.PROPERTY_NAME)
      out.push({ code, name })
      seen.add(code)
    }

    return out
  }, [propertyTable])

  const matchedCodes = useMemo(() => {
    return new Set(Object.keys(buildingsBySiteCode ?? {}))
  }, [buildingsBySiteCode])

  const grouped = useMemo(() => {
    const byRegion = new Map<string, PropertyRow[]>()

    for (const p of properties) {
      const building = buildingsBySiteCode?.[p.code]
      const region = normalizeCode(building?.region) || 'Unmatched'
      const bucket = byRegion.get(region) ?? []
      bucket.push(p)
      byRegion.set(region, bucket)
    }

    const regions = Array.from(byRegion.keys()).sort((a, b) => {
      if (a === 'Unmatched' && b !== 'Unmatched') return 1
      if (b === 'Unmatched' && a !== 'Unmatched') return -1
      return a.localeCompare(b)
    })

    return regions.map((region) => ({
      region,
      items: (byRegion.get(region) ?? []).sort((a, b) => a.code.localeCompare(b.code)),
    }))
  }, [properties, buildingsBySiteCode])

  if (!propertyTable) {
    return (
      <Stack gap="xs">
        <Text fw={900}>Buildings</Text>
        <Text c="dimmed" size="sm">
          Upload the property table to audit buildings.
        </Text>
      </Stack>
    )
  }

  return (
    <Stack gap="sm">
      <Group justify="space-between" wrap="nowrap">
        <Text fw={900}>Buildings</Text>
        {loading ? <Loader size="xs" /> : null}
      </Group>

      <UnstyledButton
        onClick={() => {
          const next = new URLSearchParams(searchParams)
          next.delete('property')
          setSearchParams(next)
        }}
        style={{
          padding: 10,
          borderRadius: 10,
          background: selected === 'overview' ? 'var(--page-accent-light-bg)' : undefined,
        }}
      >
        <Text fw={700} size="sm">Overview</Text>
        <Text c="dimmed" size="xs">Select a property below.</Text>
      </UnstyledButton>

      <Divider />

      <ScrollArea type="auto" h={520}>
        <Stack gap="sm" p={2}>
          {grouped.map((g) => (
            <Stack key={g.region} gap={4}>
              <Text size="xs" fw={800} c="dimmed">
                {g.region}
              </Text>

              {g.items.map((p) => {
                const isSelected = selected === p.code
                const isMatched = matchedCodes.has(p.code)

                return (
                  <UnstyledButton
                    key={p.code}
                    onClick={() => {
                      const next = new URLSearchParams(searchParams)
                      next.set('property', p.code)
                      setSearchParams(next)
                    }}
                    style={{
                      padding: 10,
                      borderRadius: 10,
                      background: isSelected ? 'var(--page-accent-light-bg)' : undefined,
                    }}
                  >
                    <Group justify="space-between" align="flex-start" wrap="nowrap" gap="xs">
                      <Box style={{ minWidth: 0 }}>
                        <Text fw={700} size="sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.code}
                        </Text>
                        <Text c="dimmed" size="xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.name || '—'}
                        </Text>
                      </Box>

                      {!isMatched && buildingsBySiteCode ? <IconAlertTriangle size={16} /> : null}
                    </Group>
                  </UnstyledButton>
                )
              })}
            </Stack>
          ))}
        </Stack>
      </ScrollArea>
    </Stack>
  )
}
