import type { StandardTableKey } from './dataBank'

function normalizeColumnName(name: string): string {
  return name.trim().toUpperCase()
}

// Some sources include IS_DELETE_FLAG; we always ignore it.
const IGNORED_COLUMNS = new Set(['IS_DELETE_FLAG'])

function cols(...names: string[]): string[] {
  const out: string[] = []
  for (const n of names) {
    const normalized = normalizeColumnName(n)
    if (!normalized) continue
    if (IGNORED_COLUMNS.has(normalized)) continue
    out.push(n)
  }
  return out
}

export const REQUIRED_COLUMNS: Record<StandardTableKey, string[]> = {
  'cf.floor': cols('FLOOR_CODE', 'FLOOR_DESCRIPTION', 'PROPERTY_CODE', 'IS_DELETED_FLAG'),

  'cf.meter_assignment': cols(
    'METER_CODE',
    'PROPERTY_GROUP_CODE',
    'PROPERTY_CODE',
    'FLOOR_CODE',
    'UNIT_CODE',
    'MULTIPLICATION_FACTOR',
    'IS_DELETED_FLAG',
  ),

  'cf.meter_master': cols(
    'METER_ID',
    'METER_CODE',
    'METER_DESCRIPTION',
    'MANUFACTURER',
    'INSTALLATION_DATE',
    'STATUS',
    'UTILITY_TYPE',
    'UOM',
    'SERIAL_NUMBER',
    'IS_VIRTUAL',
    'CERTIFICATION_DATE',
    'EXT_METER_CODE',
    'HAS_READINGS',
    'IS_MANUAL',
    'READING_INTERVAL',
    'IS_MAIN_METER',
    'RELATED_UTILITY_METER_ID',
    'METER_READER_NAME',
    'METER_DEVICE_CATEGORY',
    'UTILITY_METER_NAME',
    'NEXT_CERTIFICATION_DATE',
    'UTILITY_ACCOUNT',
    'IS_DELETED_FLAG',
  ),

  'cf.property': cols(
    'PROPERTY_CODE',
    'PROPERTY_NAME',
    'GROUP',
    'PROPERTY_CITY',
    'PROPERTY_GROUP_CODE',
    'IS_DELETED_FLAG',
  ),

  'cf.property_group': cols(
    'PROPERTY_GROUP_CODE',
    'PROPERTY_GROUP_NAME',
    'PROPERTY_GROUP_REGION',
    'IS_DELETED_FLAG',
  ),

  'cf.tenant': cols(
    'TENANT_CODE',
    'TENANT_NAME',
    'TENANT_TYPE',
    'TENANT_PARENT',
    'PROPERTY_GROUP_CODE',
    'PROPERTY_CODE',
    'FLOOR_CODE',
    'UNIT_CODE',
    'MOVE_IN_DATE',
    'MOVE_OUT_DATE',
    'IS_DELETED_FLAG',
  ),

  'cf.unit': cols(
    'UNIT_CODE',
    'UNIT_TYPE',
    'UNIT_RENTAL_TYPE',
    'UNIT_SQFT',
    'PROPERTY_CODE',
    'FLOOR_CODE',
    'IS_DELETED_FLAG',
  ),

  'carma.meter_assignment': cols(
    'meter_code',
    'Property_group_code',
    'Property_code',
    'Floor_code',
    'Unit_code',
    'multiplication_factor',
    'is_deleted_flag',
  ),

  'carma.meter_hierarchy': cols(
    'meter_code',
    'parent_meter_code',
    'multiplication_factor',
    'Is_a_subtraction_meter',
    'is_critical',
    'is_deleted_flag',
  ),

  'carma.meter_master': cols(
    'meter_id',
    'meter_code',
    'Meter_description',
    'Manufacturer',
    'Installation_date',
    'Status',
    'Utility_type',
    'UoM',
    'Serial_number',
    'Is_virtual_flag',
    'Certification_date',
    'Ext_meter_code',
    'has_readings',
    'Is_manual',
    'reading_interval',
    'is_deleted_flag',
  ),
}

export function getRequiredColumns(key: StandardTableKey): string[] {
  return REQUIRED_COLUMNS[key] ?? []
}

export function isIgnoredColumn(name: string): boolean {
  return IGNORED_COLUMNS.has(normalizeColumnName(name))
}

export function normalizeForCompare(name: string): string {
  return normalizeColumnName(name)
}
