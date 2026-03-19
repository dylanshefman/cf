import type { RowRecord, StandardTableKey, TableData } from './dataBank'

function stripLeadingSevenChars(value: unknown): string {
  if (value === null || value === undefined) return ''
  const raw = typeof value === 'string' ? value.trim() : String(value).trim()
  if (!raw) return ''
  if (raw.length <= 7) return ''
  return raw.slice(7).trim()
}

function stripCarmaMeterAssignmentRow(row: RowRecord): RowRecord {
  const candidates = ['meter_code', 'METER_CODE', 'Meter_code'] as const
  for (const key of candidates) {
    if (!(key in row)) continue
    const next = stripLeadingSevenChars((row as any)[key])
    if (next === (row as any)[key]) return row
    return { ...row, [key]: next }
  }
  return row
}

export function normalizeTableDataOnIngest(key: StandardTableKey, data: TableData): TableData {
  if (key !== 'carma.meter_assignment') return data

  const rows = (data.rows ?? []).map((r) => stripCarmaMeterAssignmentRow(r))
  return {
    ...data,
    rows,
  }
}
