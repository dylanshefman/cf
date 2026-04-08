import type { StandardTableKey } from './dataBank'

export type OperationId =
  | 'add_tenants'
  | 'add_levels'
  | 'add_space_units'
  | 'assign_tenant_to_space'
  | 'assign_meter_to_space'

export type OperationSpec = {
  id: OperationId
  label: string
  requiredTables: StandardTableKey[]
}

const ALWAYS_REQUIRED: StandardTableKey[] = ['cf.property']

function withAlwaysRequired(extra: StandardTableKey[]): StandardTableKey[] {
  const out: StandardTableKey[] = []
  const seen = new Set<StandardTableKey>()

  for (const k of [...ALWAYS_REQUIRED, ...extra]) {
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }

  return out
}

export const OPERATIONS: OperationSpec[] = [
  {
    id: 'add_tenants',
    label: 'Add tenants',
    requiredTables: withAlwaysRequired(['cf.tenant']),
  },
  {
    id: 'add_levels',
    label: 'Add levels',
    requiredTables: withAlwaysRequired(['cf.floor']),
  },
  {
    id: 'add_space_units',
    label: 'Add space units',
    requiredTables: withAlwaysRequired(['cf.unit']),
  },
  {
    id: 'assign_tenant_to_space',
    label: 'Assign tenant to space',
    // Note: request said cf.tenants, but the standard table key in this app is cf.tenant
    requiredTables: withAlwaysRequired(['cf.tenant', 'cf.unit']),
  },
  {
    id: 'assign_meter_to_space',
    label: 'Assign meter to space',
    // Note: request said carma.meter_assignments, but the standard table key is carma.meter_assignment
    requiredTables: withAlwaysRequired(['carma.meter_assignment']),
  },
]

export function getOperationSpec(id: OperationId): OperationSpec {
  const found = OPERATIONS.find((o) => o.id === id)
  if (!found) {
    throw new Error(`Unknown operation: ${id}`)
  }
  return found
}
