import Papa from 'papaparse'

export type ParsedCsv = {
  columns: string[]
  rows: Record<string, unknown>[]
}

export function parseCsvText(text: string): ParsedCsv {
  // Most of your exports appear header-based; we default to header parsing.
  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    // Keep all values as strings to preserve identifiers (leading zeros, exact formatting).
    dynamicTyping: false,
  })

  if (parsed.errors?.length) {
    const first = parsed.errors[0]
    throw new Error(first.message || 'CSV parse error')
  }

  const rows = (parsed.data || []).filter((r) => r && Object.keys(r).length > 0)
  const columns = parsed.meta?.fields?.length
    ? parsed.meta.fields
    : rows.length
      ? Object.keys(rows[0])
      : []

  return { columns, rows }
}
