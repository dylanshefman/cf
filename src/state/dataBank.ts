export const CF_TABLES = [
  'floor',
  'meter_assignment',
  'meter_master',
  'property',
  'property_group',
  'tenant',
  'unit',
] as const

export const CARMA_TABLES = [
  'meter_assignment',
  'meter_hierarchy',
  'meter_master',
] as const

export type Category = 'cf' | 'carma'
export type CfTable = (typeof CF_TABLES)[number]
export type CarmaTable = (typeof CARMA_TABLES)[number]

export type StandardTableKey =
  | `cf.${CfTable}`
  | `carma.${CarmaTable}`

export type RowRecord = Record<string, unknown>

export type TableData = {
  columns: string[]
  rows: RowRecord[]
  sourceLabel: string
  ingestedAtIso: string
}

export type DataBank = {
  cf: Partial<Record<CfTable, TableData>>
  carma: Partial<Record<CarmaTable, TableData>>
}

export const emptyDataBank: DataBank = {
  cf: {},
  carma: {},
}

export function splitStandardKey(key: StandardTableKey): {
  category: Category
  table: CfTable | CarmaTable
} {
  const [category, table] = key.split('.') as [Category, CfTable | CarmaTable]
  return { category, table }
}

export function standardTableOptions(): Array<{
  group: string
  items: Array<{
    value: StandardTableKey
    label: string
  }>
}> {
  return [
    {
      group: 'cf',
      items: CF_TABLES.map((t) => ({
        value: `cf.${t}` as const,
        label: t,
      })),
    },
    {
      group: 'carma',
      items: CARMA_TABLES.map((t) => ({
        value: `carma.${t}` as const,
        label: t,
      })),
    },
  ]
}

export function guessStandardKeyFromPath(inputPath: string): StandardTableKey | undefined {
  const lower = inputPath.toLowerCase()

  // Prefer more specific matches first.
  const candidates: Array<{ needle: string; key: StandardTableKey }> = [
    { needle: 'cf_floor', key: 'cf.floor' },
    { needle: 'cf_meter_assignment', key: 'cf.meter_assignment' },
    { needle: 'cf_meter_master', key: 'cf.meter_master' },
    { needle: 'cf_property_group', key: 'cf.property_group' },
    { needle: 'cf_property', key: 'cf.property' },
    { needle: 'cf_tenant', key: 'cf.tenant' },
    { needle: 'cf_unit', key: 'cf.unit' },

    { needle: 'carma_meter_hierarchy', key: 'carma.meter_hierarchy' },
    { needle: 'carma_meter_assignment', key: 'carma.meter_assignment' },
    { needle: 'carma_meter_master', key: 'carma.meter_master' },
  ]

  const found = candidates.find((c) => lower.includes(c.needle))
  if (found) return found.key

  // Fallback for generic file names.
  const ends = (suffix: string) => lower.endsWith(suffix)
  if (ends('meter_hierarchy.csv')) return 'carma.meter_hierarchy'
  if (ends('meter_assignment.csv')) return 'cf.meter_assignment'
  if (ends('meter_master.csv')) return 'cf.meter_master'

  return undefined
}
