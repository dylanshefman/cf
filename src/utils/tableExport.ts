import * as XLSX from 'xlsx'
import type { StandardTableKey, TableData } from '../state/dataBank'

type ExportableTable = {
  key: StandardTableKey
  data: TableData
}

function toTextCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function toXlsxCell(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') return value
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function buildCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const header = columns.map(escapeCsvCell).join(',')
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(toTextCell(row[c]))).join(','))
  return [header, ...body].join('\n')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_')
}

function toSheetName(key: StandardTableKey, index: number): string {
  const safe = key.replace(/[\\/?*\[\]:]/g, '_')
  const maxLen = 31
  const base = safe.slice(0, maxLen)
  return index === 0 ? base : `${base.slice(0, maxLen - 3)}`
}

export function exportTableAsCsv(tableKey: StandardTableKey, data: TableData) {
  const csv = buildCsv(data.columns, data.rows)
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' })
  const filename = `${sanitizeFilenamePart(tableKey)}.csv`
  downloadBlob(blob, filename)
}

export function exportAllTablesAsXlsx(tables: ExportableTable[]) {
  if (!tables.length) return

  const workbook = XLSX.utils.book_new()
  const usedNames = new Set<string>()

  tables.forEach((table, idx) => {
    let name = toSheetName(table.key, idx)
    while (usedNames.has(name)) {
      name = toSheetName(table.key, idx + usedNames.size + 1)
    }
    usedNames.add(name)

    const aoa = [
      table.data.columns,
      ...table.data.rows.map((row) => table.data.columns.map((c) => toXlsxCell(row[c]))),
    ]
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  })

  const bytes = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  downloadBlob(blob, 'all_uploaded_tables.xlsx')
}
