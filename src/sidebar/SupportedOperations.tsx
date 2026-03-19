import { Badge, Box, Group, Stack, Text, Tooltip } from '@mantine/core'
import { useMemo } from 'react'
import type { StandardTableKey, TableData } from '../state/dataBank'
import { useDataBank } from '../state/dataBankContext'
import { OPERATIONS } from '../state/operationsMetadata'
import { getRequiredColumns, isIgnoredColumn, normalizeForCompare } from '../state/tableMetadata'

function getTableDataByKey(bank: ReturnType<typeof useDataBank>['bank'], key: StandardTableKey): TableData | undefined {
  const [category, table] = key.split('.') as ['cf' | 'carma', string]
  if (category === 'cf') return bank.cf[table as keyof typeof bank.cf]
  return bank.carma[table as keyof typeof bank.carma]
}

function missingRequiredColumnsCount(key: StandardTableKey, data: TableData): number {
  const required = getRequiredColumns(key)
  if (!required.length) return Number.POSITIVE_INFINITY

  const present = new Set(
    data.columns
      .filter((c) => !isIgnoredColumn(c))
      .map((c) => normalizeForCompare(c)),
  )

  return required.reduce((acc, c) => {
    return acc + (present.has(normalizeForCompare(c)) ? 0 : 1)
  }, 0)
}

function operationIssues(bank: ReturnType<typeof useDataBank>['bank'], requiredTables: StandardTableKey[]): string[] {
  const issues: string[] = []

  for (const key of requiredTables) {
    const data = getTableDataByKey(bank, key)
    if (!data) {
      issues.push(`Missing table: ${key}`)
      continue
    }

    const missing = missingRequiredColumnsCount(key, data)
    if (!Number.isFinite(missing)) {
      issues.push(`Missing required-column metadata: ${key}`)
    } else if (missing > 0) {
      issues.push(`${key} missing ${missing} required column(s)`)
    }
  }

  return issues
}

export function SupportedOperations() {
  const { bank } = useDataBank()

  const ops = useMemo(() => {
    return OPERATIONS.map((op) => {
      const issues = operationIssues(bank, op.requiredTables)
      return {
        id: op.id,
        label: op.label,
        issues,
        enabled: issues.length === 0,
      }
    })
  }, [bank])

  return (
    <Stack gap={8}>
      <Text fw={900} size="sm">
        Enabled Operations
      </Text>

      <Group gap={6} wrap="wrap">
        {ops.map((op) => {
          const badge = (
            <Badge key={op.id} variant="light" color={op.enabled ? 'green' : 'gray'}>
              {op.label}
            </Badge>
          )

          if (op.enabled) return badge

          return (
            <Tooltip
              key={op.id}
              withinPortal={false}
              multiline
              maw={320}
              label={
                <Stack gap={2}>
                  {op.issues.map((t) => (
                    <Text key={t} size="xs">
                      {t}
                    </Text>
                  ))}
                </Stack>
              }
            >
              <Box>{badge}</Box>
            </Tooltip>
          )
        })}
      </Group>
    </Stack>
  )
}
