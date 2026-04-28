import { Box, Button, Group, Loader, Paper, Stack, Text } from '@mantine/core'
import { IconRefresh } from '@tabler/icons-react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import type { LayoutOutletContext } from '../layout/EnforcedLayout'
import { useDataBank } from '../state/dataBankContext'
import { useBuildingsBySiteCode } from '../state/buildingsApiCache'
import { useTenantsByBuildingId } from '../state/tenantsApiCache'
import { useSpacesByBuildingIdCategory } from '../state/spacesApiCache'
import { useSpaceAssignmentsByBuildingId } from '../state/spaceAssignmentsApiCache'
import { useMeterAssignmentsByBuildingId } from '../state/meterAssignmentsApiCache'
import kodeLogoUrl from '../assets/kode-logo.png'
import cfLogoUrl from '../assets/cf-logo.png'
import { TenantsCompareChart } from '../components/TenantsCompareChart.tsx'
import { EntityCompareChart } from '../components/compare/EntityCompareChart'
import { CF_GRAPH_COLOR, KODE_GRAPH_COLOR } from '../utils/graphColors'
import { compareRows } from '../components/compare/compareLogic'
import type { CreateCandidate, DeleteCandidate, UpdateCandidate } from '../components/compare/compareTypes'
import { SpacesResolveDifferencesModal } from '../components/SpacesResolveDifferencesModal'
import { AssignmentsResolveDifferencesModal } from '../components/AssignmentsResolveDifferencesModal'
import { requestJson } from '../utils/api'
import { useMetersByBuildingId } from '../state/metersApiCache'

type PropertyRow = {
  code: string
  name: string
}

function normalizeCode(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

function normalizeKey(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

function normalizeStatus(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  return s.trim().toLowerCase()
}

function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const s = typeof value === 'string' ? value.trim() : String(value)
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function normalizeArea(value: unknown): string {
  if (value === null || value === undefined) return ''

  const stripTrailingZeros = (s: string) => s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')

  const canonicalNumber = (n: number): string => {
    if (!Number.isFinite(n)) return ''
    if (Number.isInteger(n)) return String(n)
    return stripTrailingZeros(n.toFixed(6))
  }

  const canonicalUnit = (raw: unknown): string => {
    const s = normalizeStatus(raw)
    if (!s) return ''
    const cleaned = s.replace('²', '2').replace('^2', '2')
    if (cleaned === 'ft2' || cleaned === 'sqft' || cleaned === 'sq ft' || cleaned === 'square_feet' || cleaned === 'square feet') {
      return 'ft\\u00b2'
    }
    if (cleaned === 'm2' || cleaned === 'sqm' || cleaned === 'sq m' || cleaned === 'square_meter' || cleaned === 'square meter') {
      return 'm2'
    }
    return cleaned
  }

  const toAreaParts = (input: unknown): { num: number | null; unit: string } => {
    if (input === null || input === undefined) return { num: null, unit: '' }

    if (typeof input === 'string') {
      const s = input.trim()
      const m = s.match(/^(-?\d+(?:\.\d+)?)\s*\|\s*(.+)$/)
      if (m) {
        const num = parseNumber(m[1])
        const unit = canonicalUnit(m[2])
        return { num, unit }
      }
      return { num: parseNumber(s), unit: '' }
    }

    if (typeof input === 'number') {
      return { num: Number.isFinite(input) ? input : null, unit: '' }
    }

    if (typeof input === 'object') {
      const v: any = input
      const num = parseNumber(v.value)

      const unitRaw = v.unit
      const unit =
        typeof unitRaw === 'string'
          ? canonicalUnit(unitRaw)
          : unitRaw && typeof unitRaw === 'object'
            ? canonicalUnit((unitRaw as any)?.symbol ?? (unitRaw as any)?._id)
            : ''

      return { num, unit }
    }

    return { num: null, unit: '' }
  }

  const { num, unit } = toAreaParts(value)
  if (num === null) return ''
  const u = unit || 'ft\\u00b2'
  return `${canonicalNumber(num)}|${u}`
}

function getSpaceId(raw: any): string {
  const id = raw?._id ?? raw?.id ?? raw?.spaceId
  return id ? String(id).trim() : ''
}

function getSpaceIdentifier(raw: any): string {
  const id = raw?.identifier
  return id ? String(id).trim() : ''
}

function getPartOfId(raw: any): string {
  const id =
    raw?.partOf?.id ??
    raw?.partOf?._id ??
    raw?.partOfId ??
    raw?.parentSpaceId
  return id ? String(id).trim() : ''
}

function getTenantId(raw: any): string {
  const id = raw?._id ?? raw?.id ?? raw?.tenantId
  return id ? String(id).trim() : ''
}

function normalizeLocalDate(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = String(value).trim()
  if (!s) return ''
  // Accept ISO LocalDate (YYYY-MM-DD) or ISO timestamps; keep date part.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : s
}

export function AuditPage() {
  const { bank } = useDataBank()
  const [searchParams] = useSearchParams()
  const { headerRightRef } = useOutletContext<LayoutOutletContext>()
  const propertyTable = bank.cf.property
  const tenantTable = bank.cf.tenant
  const floorTable = bank.cf.floor
  const unitTable = bank.cf.unit
  const carmaMeterAssignmentTable = bank.carma.meter_assignment

  const {
    data: buildingsBySiteCode,
    bySiteIdentifierRaw,
    loading: buildingsLoading,
    error: buildingsError,
    refresh,
  } = useBuildingsBySiteCode(1, Boolean(propertyTable))

  const [headerReady, setHeaderReady] = useState(false)

  useEffect(() => {
    if (headerRightRef.current) setHeaderReady(true)
  }, [headerRightRef])

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
    if (!buildingsBySiteCode) return new Set<string>()
    return new Set(Object.keys(buildingsBySiteCode))
  }, [buildingsBySiteCode])

  const selectedCode = normalizeCode(searchParams.get('property'))
  const selectedProperty = selectedCode ? properties.find((p) => p.code === selectedCode) ?? null : null

  const selectedBuilding = useMemo(() => {
    if (!selectedProperty) return null
    return bySiteIdentifierRaw?.[selectedProperty.code] ?? null
  }, [bySiteIdentifierRaw, selectedProperty])

  const selectedPropertyRow = useMemo(() => {
    if (!selectedCode) return null
    if (!propertyTable) return null
    return propertyTable.rows.find((r) => normalizeCode(r.PROPERTY_CODE) === selectedCode) ?? null
  }, [propertyTable, selectedCode])

  const selectedPropertyDisplayName = useMemo(() => {
    const fromRow = normalizeCode(selectedPropertyRow?.PROPERTY_NAME)
    if (fromRow) return fromRow
    return selectedProperty?.name ?? ''
  }, [selectedProperty?.name, selectedPropertyRow])

  const buildingName = useMemo(() => {
    const b: any = selectedBuilding
    if (!b) return ''
    return normalizeCode(b.name) || normalizeCode(b.site?.name)
  }, [selectedBuilding])

  const selectedBuildingId = useMemo(() => {
    const b: any = selectedBuilding
    if (!b) return ''
    return normalizeCode(b._id)
  }, [selectedBuilding])

  const {
    data: tenantsRaw,
    loading: tenantsLoading,
    error: tenantsError,
    refresh: refreshTenants,
  } = useTenantsByBuildingId(
    selectedBuildingId,
    Boolean(selectedProperty && buildingsBySiteCode && matchedCodes.has(selectedProperty.code) && selectedBuildingId),
  )

  const spacesEnabled = Boolean(selectedProperty && buildingsBySiteCode && matchedCodes.has(selectedProperty.code) && selectedBuildingId)

  const {
    data: apiFloorsRaw,
    loading: floorsLoading,
    error: floorsError,
    ready: floorsReady,
    refresh: refreshFloors,
  } = useSpacesByBuildingIdCategory(selectedBuildingId, 'Level', spacesEnabled)

  const {
    data: apiUnitsRaw,
    loading: unitsLoading,
    error: unitsError,
    ready: unitsReady,
    refresh: refreshUnits,
  } = useSpacesByBuildingIdCategory(selectedBuildingId, 'SpaceUnit', spacesEnabled)

  const {
    data: assignmentsRaw,
    loading: assignmentsLoading,
    error: assignmentsError,
    ready: assignmentsReady,
    refresh: refreshAssignments,
  } = useSpaceAssignmentsByBuildingId(selectedBuildingId, spacesEnabled)

  const meterAssignmentsEnabled = Boolean(spacesEnabled && carmaMeterAssignmentTable)
  const meterAssignmentsUploadKey = carmaMeterAssignmentTable?.ingestedAtIso ?? ''

  const {
    data: meterAssignmentsRaw,
    loading: meterAssignmentsLoading,
    error: meterAssignmentsError,
    ready: meterAssignmentsReady,
    refresh: refreshMeterAssignments,
  } = useMeterAssignmentsByBuildingId(selectedBuildingId, meterAssignmentsEnabled, meterAssignmentsUploadKey)

  const headerRefresh =
    propertyTable && headerReady && headerRightRef.current
      ? createPortal(
          <Button
            aria-label="Refresh data"
            onClick={() => {
              refresh()
              refreshTenants()
              refreshFloors()
              refreshUnits()
              refreshAssignments()
              refreshMeterAssignments()
            }}
            loading={
              buildingsLoading ||
              tenantsLoading ||
              floorsLoading ||
              unitsLoading ||
              assignmentsLoading ||
              meterAssignmentsLoading
            }
            leftSection={<IconRefresh size={16} />}
            styles={{
              root: {
                backgroundImage: 'var(--page-accent-bg)',
              },
            }}
          >
            Refresh
          </Button>,
          headerRightRef.current,
        )
      : null

  const propertyCodeByBuildingId = useMemo(() => {
    const out: Record<string, string> = {}
    if (!bySiteIdentifierRaw) return out

    for (const [propertyCode, building] of Object.entries(bySiteIdentifierRaw)) {
      const b: any = building
      const buildingId = normalizeCode(b?._id)
      if (!buildingId) continue
      out[buildingId] = normalizeCode(propertyCode)
    }

    return out
  }, [bySiteIdentifierRaw])

  const uploadedTenants = useMemo(() => {
    if (!tenantTable) return []
    if (!selectedProperty) return []

    return tenantTable.rows.filter((row) => normalizeCode((row as any).PROPERTY_CODE) === selectedProperty.code)
  }, [selectedProperty, tenantTable])

  const uploadedFloors = useMemo(() => {
    if (!floorTable) return []
    if (!selectedProperty) return []

    const hasPropertyCode = floorTable.rows.some((r) => typeof (r as any).PROPERTY_CODE !== 'undefined')
    if (!hasPropertyCode) return floorTable.rows

    return floorTable.rows.filter((row) => normalizeCode((row as any).PROPERTY_CODE) === selectedProperty.code)
  }, [floorTable, selectedProperty])

  const uploadedUnits = useMemo(() => {
    if (!unitTable) return []
    if (!selectedProperty) return []

    const hasPropertyCode = unitTable.rows.some((r) => typeof (r as any).PROPERTY_CODE !== 'undefined')
    if (!hasPropertyCode) return unitTable.rows

    return unitTable.rows.filter((row) => normalizeCode((row as any).PROPERTY_CODE) === selectedProperty.code)
  }, [selectedProperty, unitTable])

  const apiTenants = useMemo(() => {
    if (!tenantsRaw) return []
    if (!Array.isArray(tenantsRaw)) return []
    return tenantsRaw
  }, [tenantsRaw])

  const apiFloors = useMemo(() => {
    if (!apiFloorsRaw) return []
    if (!Array.isArray(apiFloorsRaw)) return []
    return apiFloorsRaw
  }, [apiFloorsRaw])

  const apiUnits = useMemo(() => {
    if (!apiUnitsRaw) return []
    if (!Array.isArray(apiUnitsRaw)) return []
    return apiUnitsRaw
  }, [apiUnitsRaw])

  const apiAssignments = useMemo(() => {
    if (!assignmentsRaw) return []
    if (!Array.isArray(assignmentsRaw)) return []
    return assignmentsRaw
  }, [assignmentsRaw])

  const apiMeterAssignments = useMemo(() => {
    if (!meterAssignmentsRaw) return []
    if (!Array.isArray(meterAssignmentsRaw)) return []
    return meterAssignmentsRaw
  }, [meterAssignmentsRaw])

  const unitsCompareError = useMemo(() => {
    if (unitsError) return unitsError
    if (floorsError) return 'Unable to load floors (Level) mapping required to compare units.'
    return ''
  }, [floorsError, unitsError])

  const levelIdentifierById = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of apiFloors) {
      const id = getSpaceId(row)
      const identifier = getSpaceIdentifier(row)
      if (!id || !identifier) continue
      out[id] = identifier
    }
    return out
  }, [apiFloors])

  const unitIdentifierById = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of apiUnits) {
      const id = getSpaceId(row)
      const identifier = getSpaceIdentifier(row)
      if (!id || !identifier) continue
      out[id] = identifier
    }
    return out
  }, [apiUnits])

  const unitIdByIdentifier = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of apiUnits) {
      const id = getSpaceId(row)
      const identifier = normalizeKey(getSpaceIdentifier(row))
      if (!id || !identifier) continue
      out[identifier] = id
    }
    return out
  }, [apiUnits])

  const tenantCodeByTenantId = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of apiTenants) {
      const id = getTenantId(row)
      const code = normalizeCode((row as any)?.identifier)
      if (!id || !code) continue
      out[id] = code
    }
    return out
  }, [apiTenants])

  const tenantIdByTenantCode = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of apiTenants) {
      const id = getTenantId(row)
      const code = normalizeKey((row as any)?.identifier)
      if (!id || !code) continue
      out[code] = id
    }
    return out
  }, [apiTenants])

  type TenantSpaceAssignmentRow = {
    tenantCode: string
    unitCode: string
    startDate: string
    endDate: string
    assignmentId: string
    spaceId: string
    tenant: any
    space: any
    raw: any
  }

  const apiTenantSpaceAssignments = useMemo((): TenantSpaceAssignmentRow[] => {
    const out: TenantSpaceAssignmentRow[] = []

    for (const a of apiAssignments as any[]) {
      const assignmentId = normalizeCode(a?._id)
      const tenantId = normalizeCode(a?.tenant?._id)
      const tenantCode = normalizeCode(tenantCodeByTenantId[tenantId] ?? '')

      const startDate = normalizeLocalDate(a?.startDate)
      const endDate = normalizeLocalDate(a?.endDate)

      const spaces = Array.isArray(a?.spaces) ? a.spaces : []
      for (const s of spaces) {
        const spaceId = normalizeCode(s?._id)
        const unitCode = normalizeCode(unitIdentifierById[spaceId] ?? '')

        out.push({
          tenantCode,
          unitCode,
          startDate,
          endDate,
          assignmentId,
          spaceId,
          tenant: a?.tenant ?? null,
          space: s ?? null,
          raw: a,
        })
      }
    }

    return out
  }, [apiAssignments, tenantCodeByTenantId, unitIdentifierById])

  const assignmentSpaceCountById = useMemo(() => {
    const out: Record<string, number> = {}
    for (const row of apiTenantSpaceAssignments) {
      const id = normalizeCode(row.assignmentId)
      if (!id) continue
      out[id] = (out[id] ?? 0) + 1
    }
    return out
  }, [apiTenantSpaceAssignments])

  type MeterSpaceAssignmentRow = {
    identifier: string
    unitCode: string
    meter: any
    space: any
    raw: any
  }

  const uploadedMeterSpaceAssignments = useMemo((): MeterSpaceAssignmentRow[] => {
    if (!carmaMeterAssignmentTable) return []
    if (!selectedProperty) return []

    const out: MeterSpaceAssignmentRow[] = []
    for (const row of carmaMeterAssignmentTable.rows as any[]) {
      const propertyCode = normalizeCode(row?.Property_code)
      if (propertyCode && propertyCode !== selectedProperty.code) continue

      const deletedFlag = normalizeCode(row?.is_deleted_flag)
      if (deletedFlag === '1') continue

      const identifier = normalizeKey(row?.meter_code)
      const unitCode = normalizeKey(row?.Unit_code)
      if (!identifier || !unitCode) continue

      out.push({
        identifier,
        unitCode,
        meter: { identifier },
        space: { identifier: unitCode, name: unitCode, category: 'SpaceUnit' },
        raw: row,
      })
    }
    return out
  }, [carmaMeterAssignmentTable, selectedProperty])

  const apiMeterSpaceAssignments = useMemo((): MeterSpaceAssignmentRow[] => {
    const out: MeterSpaceAssignmentRow[] = []

    for (const a of apiMeterAssignments as any[]) {
      const meter = a?.meter ?? null

      const spaceId = normalizeCode(a?.spaceId ?? a?.space?._id ?? a?.space?.id)
      const unitCode = normalizeKey(unitIdentifierById[spaceId] ?? a?.space?.identifier)

      const space = {
        _id: spaceId,
        identifier: unitCode,
        name: unitCode,
        category: 'SpaceUnit',
      }

      const identifier = normalizeKey(meter?.identifier)

      if (!unitCode) continue

      out.push({
        identifier,
        unitCode,
        meter,
        space,
        raw: a,
      })
    }

    return out
  }, [apiMeterAssignments, unitIdentifierById])

  const [spacesResolveOpened, setSpacesResolveOpened] = useState(false)
  const [assignmentsResolveOpened, setAssignmentsResolveOpened] = useState(false)

  const metersEnabledForResolve = Boolean(assignmentsResolveOpened && meterAssignmentsEnabled)
  const {
    data: apiMetersRaw,
    loading: metersLoading,
    error: metersError,
    ready: metersReady,
  } = useMetersByBuildingId(selectedBuildingId, metersEnabledForResolve)

  const apiMeters = useMemo(() => {
    if (!apiMetersRaw) return [] as any[]
    if (!Array.isArray(apiMetersRaw)) return [] as any[]
    return apiMetersRaw as any[]
  }, [apiMetersRaw])

  const meterIdByMeterIdentifier = useMemo(() => {
    const out: Record<string, string> = {}
    for (const m of apiMeters) {
      const id = normalizeCode(m?._id ?? m?.id)
      if (!id) continue
      const ident = normalizeCode(m?.identifier)
      const code = normalizeKey(ident)
      const key = normalizeKey(code)
      if (!key) continue
      if (out[key]) continue
      out[key] = id
    }
    return out
  }, [apiMeters])

  const levelIdByIdentifier = useMemo(() => {
    const out: Record<string, string> = {}
    for (const row of apiFloors) {
      const id = getSpaceId(row)
      const identifier = normalizeKey(getSpaceIdentifier(row))
      if (!id || !identifier) continue
      out[identifier] = id
    }
    return out
  }, [apiFloors])

  const floorCompare = useMemo(() => {
    if (!floorsReady) return null
    if (!floorTable) return null
    return compareRows({
      uploadedRows: uploadedFloors as any[],
      apiRows: apiFloors as any[],
      ctx: {},
      uploadedId: { label: 'Floor code', get: (row) => (row as any)?.FLOOR_CODE, normalize: normalizeKey },
      apiId: { label: 'Floor code', get: (row) => (row as any)?.identifier, normalize: normalizeKey },
      metadata: [],
    })
  }, [apiFloors, floorTable, floorsReady, uploadedFloors])

  const unitMetadata = useMemo(
    () => [
      {
        key: 'name',
        label: 'Name',
        getUploaded: (row: any) => row?.UNIT_CODE,
        getApi: (row: any) => row?.name,
        normalize: normalizeKey,
      },
      {
        key: 'floorCode',
        label: 'Floor',
        getUploaded: (row: any) => row?.FLOOR_CODE,
        getApi: (row: any, ctx: any) => {
          const partOfId = getPartOfId(row)
          return ctx?.levelIdentifierById?.[partOfId] ?? ''
        },
        normalize: normalizeKey,
      },
      {
        key: 'area',
        label: 'Area',
        getUploaded: (row: any) => {
          const sqft = parseNumber(row?.UNIT_SQFT)
          if (sqft === null) return null
          return { value: sqft, unit: 'ft\\u00b2' }
        },
        getApi: (row: any) => row?.area,
        normalize: normalizeArea,
      },
      {
        key: 'type',
        label: 'Type',
        getUploaded: (row: any) => row?.UNIT_TYPE,
        getApi: (row: any) => row?.type,
        normalize: normalizeKey,
      },
    ],
    [levelIdentifierById],
  )

  const unitCompare = useMemo(() => {
    if (!floorsReady || !unitsReady) return null
    if (!unitTable) return null

    return compareRows({
      uploadedRows: uploadedUnits as any[],
      apiRows: apiUnits as any[],
      ctx: { levelIdentifierById },
      uploadedId: { label: 'Unit code', get: (row) => (row as any)?.UNIT_CODE, normalize: normalizeKey },
      apiId: { label: 'Unit code', get: (row) => (row as any)?.identifier, normalize: normalizeKey },
      metadata: unitMetadata as any,
    })
  }, [apiUnits, floorsReady, levelIdentifierById, unitMetadata, unitTable, unitsReady, uploadedUnits])

  const missingFloorCandidates = useMemo(() => {
    const details = floorCompare?.details
    if (!details) return [] as Array<CreateCandidate<any>>
    const seen = new Set<string>()
    const out: Array<CreateCandidate<any>> = []
    for (const row of details.cfOnly) {
      const identifier = normalizeKey((row as any)?.FLOOR_CODE)
      if (!identifier) continue
      if (seen.has(identifier)) continue
      seen.add(identifier)
      const secondaryText = normalizeCode((row as any)?.FLOOR_DESCRIPTION) || '(no name)'
      out.push({
        key: `create-floor:${identifier}`,
        identifier,
        secondaryText,
        uploadedRow: row,
      })
    }
    return out
  }, [floorCompare])

  const deleteFloorCandidates = useMemo(() => {
    const details = floorCompare?.details
    if (!details) return [] as Array<DeleteCandidate<any>>

    const out: Array<DeleteCandidate<any>> = []
    for (const row of details.kodeOnly) {
      const apiMutationId = getSpaceId(row)
      if (!apiMutationId) continue
      const identifier = normalizeKey(getSpaceIdentifier(row)) || '(missing)'
      const secondaryText = normalizeCode((row as any)?.name) || '(no name)'
      out.push({
        key: `delete-floor:${identifier}:${apiMutationId}`,
        identifier,
        secondaryText,
        apiRow: row,
        apiMutationId,
      })
    }

    return out
  }, [floorCompare])

  const missingUnitCandidates = useMemo(() => {
    const details = unitCompare?.details
    if (!details) return [] as Array<CreateCandidate<any>>
    const seen = new Set<string>()
    const out: Array<CreateCandidate<any>> = []
    for (const row of details.cfOnly) {
      const identifier = normalizeKey((row as any)?.UNIT_CODE)
      if (!identifier) continue
      if (seen.has(identifier)) continue
      seen.add(identifier)

      const floorCode = normalizeKey((row as any)?.FLOOR_CODE)
      const floorId = floorCode ? levelIdByIdentifier[floorCode] : ''
      const disabledReason = floorCode && !floorId ? `Missing floor ${floorCode} in KODE OS (create floors first)` : !floorCode ? 'Missing FLOOR_CODE in uploaded row' : undefined

      const secondaryText = normalizeCode((row as any)?.UNIT_TYPE) || floorCode || '(no name)'

      out.push({
        key: `create-unit:${identifier}`,
        identifier,
        secondaryText,
        disabledReason,
        uploadedRow: row,
      })
    }
    return out
  }, [levelIdByIdentifier, unitCompare])

  const patchUnitCandidates = useMemo(() => {
    const details = unitCompare?.details
    if (!details) return [] as Array<UpdateCandidate<any, any>>

    const out: Array<UpdateCandidate<any, any>> = []
    for (const row of details.mismatch) {
      const apiMutationId = getSpaceId(row.apiRow)
      if (!apiMutationId) continue

      const floorCode = normalizeKey((row.uploadedRow as any)?.FLOOR_CODE)
      const floorId = floorCode ? levelIdByIdentifier[floorCode] : ''
      const disabledReason = floorCode && !floorId ? `Missing floor ${floorCode} in KODE OS (create floors first)` : !floorCode ? 'Missing FLOOR_CODE in uploaded row' : undefined

      out.push({
        key: `patch-unit:${row.identifier}:${apiMutationId}`,
        identifier: row.identifier,
        secondaryText: normalizeCode((row.uploadedRow as any)?.UNIT_TYPE) || '(no name)',
        disabledReason,
        uploadedRow: row.uploadedRow,
        apiRow: row.apiRow,
        apiMutationId,
      })
    }

    return out
  }, [levelIdByIdentifier, unitCompare])

  const deleteUnitCandidates = useMemo(() => {
    const details = unitCompare?.details
    if (!details) return [] as Array<DeleteCandidate<any>>

    const out: Array<DeleteCandidate<any>> = []
    for (const row of details.kodeOnly) {
      const apiMutationId = getSpaceId(row)
      if (!apiMutationId) continue
      const identifier = normalizeKey(getSpaceIdentifier(row)) || '(missing)'
      const secondaryText = normalizeCode((row as any)?.name) || '(no name)'
      out.push({
        key: `delete-unit:${identifier}:${apiMutationId}`,
        identifier,
        secondaryText,
        apiRow: row,
        apiMutationId,
      })
    }
    return out
  }, [unitCompare])

  const spacesResolveSections = useMemo(() => {
    const encBuildingId = encodeURIComponent(selectedBuildingId)

    return [
      {
        key: 'add-floors',
        op: 'create' as const,
        label: 'Add missing floors',
        error: floorsError || null,
        candidates: missingFloorCandidates,
        run: async (c: CreateCandidate<any>) => {
          const identifier = c.identifier
          const name = normalizeCode((c.uploadedRow as any)?.FLOOR_DESCRIPTION) || identifier
          await requestJson(`/api/spaces?buildingId=${encBuildingId}`, {
            method: 'POST',
            body: {
              identifier,
              name,
              category: 'Level',
            },
          })
        },
      },
      {
        key: 'add-units',
        op: 'create' as const,
        label: 'Add missing units',
        error: unitsCompareError || null,
        candidates: missingUnitCandidates,
        run: async (c: CreateCandidate<any>) => {
          const identifier = c.identifier
          const uploadedRow = c.uploadedRow

          const floorCode = normalizeKey((uploadedRow as any)?.FLOOR_CODE)
          const floorId = floorCode ? levelIdByIdentifier[floorCode] : ''
          if (!floorCode) throw new Error('Missing FLOOR_CODE in uploaded row')
          if (!floorId) throw new Error(`Missing floor ${floorCode} in KODE OS (create floors first)`)

          const sqft = parseNumber((uploadedRow as any)?.UNIT_SQFT)
          const unitType = normalizeCode((uploadedRow as any)?.UNIT_TYPE)

          const spaceUnit: any = {
            identifier,
            name: identifier,
            category: 'SpaceUnit',
            parentSpaceId: floorId,
            type: unitType,
            tenantUnit: true,
            leasable: true,
          }

          if (sqft !== null) spaceUnit.area = { value: sqft, unit: 'ft\\u00b2' }

          await requestJson(`/api/spaces?buildingId=${encBuildingId}`, {
            method: 'POST',
            body: spaceUnit,
          })
        },
      },
      {
        key: 'patch-units',
        op: 'update' as const,
        label: 'Patch unit metadata',
        error: unitsCompareError || null,
        candidates: patchUnitCandidates,
        run: async (c: UpdateCandidate<any, any>) => {
          const identifier = c.identifier
          const uploadedRow = c.uploadedRow
          const apiMutationId = c.apiMutationId
          const apiRow = c.apiRow

          const floorCode = normalizeKey((uploadedRow as any)?.FLOOR_CODE)
          const floorId = floorCode ? levelIdByIdentifier[floorCode] : ''
          if (!floorCode) throw new Error('Missing FLOOR_CODE in uploaded row')
          if (!floorId) throw new Error(`Missing floor ${floorCode} in KODE OS (create floors first)`)

          const sqft = parseNumber((uploadedRow as any)?.UNIT_SQFT)
          const unitType = normalizeCode((uploadedRow as any)?.UNIT_TYPE)

          const payload: any = {
            identifier,
            name: identifier,
            category: 'SpaceUnit',
            parentSpaceId: floorId,
            type: unitType,
            tenantUnit: true,
            leasable: true,
          }

          if (sqft !== null) {
            const existingUnit = (apiRow as any)?.area?.unit
            payload.area = existingUnit ? { value: sqft, unit: existingUnit } : { value: sqft, unit: 'ft\\u00b2' }
          }

          await requestJson(`/api/space?buildingId=${encBuildingId}&spaceId=${encodeURIComponent(apiMutationId)}`, {
            method: 'PUT',
            body: payload,
          })
        },
      },
      {
        key: 'delete-floors',
        op: 'delete' as const,
        label: 'Delete KODE-only floors',
        error: floorsError || null,
        candidates: deleteFloorCandidates,
        run: async (c: DeleteCandidate<any>) => {
          await requestJson(
            `/api/space?buildingId=${encBuildingId}&spaceId=${encodeURIComponent(c.apiMutationId)}`,
            {
              method: 'DELETE',
            },
          )
        },
      },
      {
        key: 'delete-units',
        op: 'delete' as const,
        label: 'Delete KODE-only units',
        error: unitsCompareError || null,
        candidates: deleteUnitCandidates,
        run: async (c: DeleteCandidate<any>) => {
          await requestJson(`/api/space?buildingId=${encBuildingId}&spaceId=${encodeURIComponent(c.apiMutationId)}`, {
            method: 'DELETE',
          })
        },
      },
    ]
  }, [
    deleteFloorCandidates,
    deleteUnitCandidates,
    floorsError,
    levelIdByIdentifier,
    missingFloorCandidates,
    missingUnitCandidates,
    patchUnitCandidates,
    selectedBuildingId,
    unitsCompareError,
  ])

  const tenantAssignmentCompare = useMemo(() => {
    return compareRows({
      uploadedRows: uploadedTenants as any[],
      apiRows: apiTenantSpaceAssignments as any[],
      ctx: {},
      uploadedId: {
        label: 'Tenant + unit',
        get: (row) => {
          const tenantCode = normalizeKey((row as any)?.TENANT_CODE)
          const unitCode = normalizeKey((row as any)?.UNIT_CODE)
          if (!tenantCode || !unitCode) return ''
          return `${tenantCode}|${unitCode}`
        },
        normalize: normalizeKey,
      },
      apiId: {
        label: 'Tenant + unit',
        get: (row) => {
          const tenantCode = normalizeKey((row as any)?.tenantCode)
          const unitCode = normalizeKey((row as any)?.unitCode)
          if (!tenantCode || !unitCode) return ''
          return `${tenantCode}|${unitCode}`
        },
        normalize: normalizeKey,
      },
      metadata: [
        {
          key: 'startDate',
          label: 'Start date',
          getUploaded: (row) => normalizeLocalDate((row as any)?.MOVE_IN_DATE),
          getApi: (row) => normalizeLocalDate((row as any)?.startDate),
          normalize: normalizeLocalDate,
        },
        {
          key: 'endDate',
          label: 'End date',
          getUploaded: (row) => normalizeLocalDate((row as any)?.MOVE_OUT_DATE),
          getApi: (row) => normalizeLocalDate((row as any)?.endDate),
          normalize: normalizeLocalDate,
        },
      ],
    })
  }, [apiTenantSpaceAssignments, uploadedTenants])

  const tenantSpaceCreateCandidates = useMemo(() => {
    const details = tenantAssignmentCompare?.details
    if (!details) return [] as Array<CreateCandidate<any>>

    const seen = new Set<string>()
    const out: Array<CreateCandidate<any>> = []
    for (const row of details.cfOnly as any[]) {
      const tenantCode = normalizeKey(row?.TENANT_CODE)
      const unitCode = normalizeKey(row?.UNIT_CODE)
      if (!tenantCode || !unitCode) continue
      const identifier = `${tenantCode}|${unitCode}`
      if (seen.has(identifier)) continue
      seen.add(identifier)

      const tenantId = tenantIdByTenantCode[tenantCode] ?? ''
      const spaceId = unitIdByIdentifier[unitCode] ?? ''

      const startDate = normalizeLocalDate(row?.MOVE_IN_DATE)
      const endDate = normalizeLocalDate(row?.MOVE_OUT_DATE)
      const secondaryText = [startDate || '(no start)', endDate || '(no end)'].join(' → ')

      const disabledReason = !tenantId
        ? `Missing tenant ${tenantCode} in KODE OS`
        : !spaceId
          ? `Missing unit ${unitCode} in KODE OS`
          : undefined

      out.push({
        key: `ts-create:${identifier}`,
        identifier,
        secondaryText,
        disabledReason,
        uploadedRow: row,
      })
    }
    return out
  }, [tenantAssignmentCompare, tenantIdByTenantCode, unitIdByIdentifier])

  const tenantSpacePatchCandidates = useMemo(() => {
    const details = tenantAssignmentCompare?.details
    if (!details) return [] as Array<UpdateCandidate<any, any>>

    const out: Array<UpdateCandidate<any, any>> = []
    for (const row of details.mismatch as any[]) {
      const apiMutationId = normalizeCode(row?.apiRow?.assignmentId)
      if (!apiMutationId) continue
      const spaceCount = assignmentSpaceCountById[apiMutationId] ?? 0

      const startDate = normalizeLocalDate(row?.uploadedRow?.MOVE_IN_DATE)
      const endDate = normalizeLocalDate(row?.uploadedRow?.MOVE_OUT_DATE)
      const secondaryText = [startDate || '(no start)', endDate || '(no end)'].join(' → ')

      const disabledReason =
        spaceCount > 1
          ? `Assignment has ${spaceCount} spaces; patch would affect multiple spaces`
          : undefined

      out.push({
        key: `ts-patch:${row.identifier}:${apiMutationId}`,
        identifier: row.identifier,
        secondaryText,
        disabledReason,
        uploadedRow: row.uploadedRow,
        apiRow: row.apiRow,
        apiMutationId,
      })
    }
    return out
  }, [assignmentSpaceCountById, tenantAssignmentCompare])

  const tenantSpaceDeleteCandidates = useMemo(() => {
    const details = tenantAssignmentCompare?.details
    if (!details) return [] as Array<DeleteCandidate<any>>

    const out: Array<DeleteCandidate<any>> = []
    for (const row of details.kodeOnly as any[]) {
      const apiMutationId = normalizeCode(row?.assignmentId)
      if (!apiMutationId) continue
      const identifier = `${normalizeKey(row?.tenantCode)}|${normalizeKey(row?.unitCode)}`
      const spaceCount = assignmentSpaceCountById[apiMutationId] ?? 0

      const startDate = normalizeLocalDate(row?.startDate)
      const endDate = normalizeLocalDate(row?.endDate)
      const secondaryText = [startDate || '(no start)', endDate || '(no end)'].join(' → ')

      const disabledReason =
        spaceCount > 1
          ? `Assignment has ${spaceCount} spaces; delete would remove multiple spaces`
          : undefined

      out.push({
        key: `ts-delete:${identifier}:${apiMutationId}`,
        identifier,
        secondaryText,
        disabledReason,
        apiRow: row,
        apiMutationId,
      })
    }
    return out
  }, [assignmentSpaceCountById, tenantAssignmentCompare])

  const meterAssignmentCompare = useMemo(() => {
    return compareRows({
      uploadedRows: uploadedMeterSpaceAssignments as any[],
      apiRows: apiMeterSpaceAssignments as any[],
      ctx: {},
      uploadedId: {
        label: 'Meter + unit',
        get: (row) => {
          const meterIdentifier = normalizeKey((row as any)?.identifier)
          const unitCode = normalizeKey((row as any)?.unitCode)
          if (!meterIdentifier || !unitCode) return ''
          return `${meterIdentifier}|${unitCode}`
        },
        normalize: normalizeKey,
      },
      apiId: {
        label: 'Meter + unit',
        get: (row) => {
          const meterIdentifier = normalizeKey((row as any)?.identifier)
          const unitCode = normalizeKey((row as any)?.unitCode)
          if (!meterIdentifier || !unitCode) return ''
          return `${meterIdentifier}|${unitCode}`
        },
        normalize: normalizeKey,
      },
      metadata: [],
    })
  }, [apiMeterSpaceAssignments, uploadedMeterSpaceAssignments])

  const meterSpaceCreateCandidates = useMemo(() => {
    const details = meterAssignmentCompare?.details
    if (!details) return [] as Array<CreateCandidate<any>>

    const out: Array<CreateCandidate<any>> = []
    for (const row of details.cfOnly as any[]) {
      const meterIdentifier = normalizeKey(row?.identifier)
      const unitCode = normalizeKey(row?.unitCode)
      if (!meterIdentifier || !unitCode) continue
      const identifier = `${meterIdentifier}|${unitCode}`

      const meterId = meterIdByMeterIdentifier[meterIdentifier] ?? ''
      const spaceId = unitIdByIdentifier[unitCode] ?? ''

      const disabledReason = !metersReady
        ? metersLoading
          ? 'Loading meters list…'
          : metersError
            ? `Unable to load meters: ${metersError}`
            : 'Meters list not loaded'
        : !meterId
          ? `Missing meter ${meterIdentifier} in KODE OS`
          : !spaceId
            ? `Missing unit ${unitCode} in KODE OS`
            : undefined

      out.push({
        key: `ms-create:${identifier}`,
        identifier,
        secondaryText: 'Assign meter to unit',
        disabledReason,
        uploadedRow: row,
      })
    }

    return out
  }, [meterAssignmentCompare, meterIdByMeterIdentifier, metersError, metersLoading, metersReady, unitIdByIdentifier])

  const meterSpaceDeleteCandidates = useMemo(() => {
    const details = meterAssignmentCompare?.details
    if (!details) return [] as Array<DeleteCandidate<any>>

    const out: Array<DeleteCandidate<any>> = []
    for (const row of details.kodeOnly as any[]) {
      const raw = row?.raw ?? null
      const meterId = normalizeCode(raw?.meterId)
      const spaceId = normalizeCode(raw?.spaceId)
      const meterIdentifier = normalizeKey(row?.identifier)
      const unitCode = normalizeKey(row?.unitCode)
      if (!meterIdentifier || !unitCode) continue

      const identifier = `${meterIdentifier}|${unitCode}`
      const apiMutationId = `${meterId}|${spaceId}`

      const disabledReason = !meterId || !spaceId ? 'Missing meterId/spaceId in KODE assignment row' : undefined

      out.push({
        key: `ms-delete:${identifier}:${apiMutationId}`,
        identifier,
        secondaryText: 'Remove meter assignment',
        disabledReason,
        apiRow: row,
        apiMutationId,
      })
    }

    return out
  }, [meterAssignmentCompare])

  const assignmentsResolveSections = useMemo(() => {
    const encBuildingId = encodeURIComponent(selectedBuildingId)

    return [
      {
        key: 'ts-add',
        op: 'create' as const,
        label: 'Add missing assignments',
        error: assignmentsError || null,
        candidates: tenantSpaceCreateCandidates,
        run: async (c: CreateCandidate<any>) => {
          const tenantCode = normalizeKey((c.uploadedRow as any)?.TENANT_CODE)
          const unitCode = normalizeKey((c.uploadedRow as any)?.UNIT_CODE)
          const tenantId = tenantIdByTenantCode[tenantCode] ?? ''
          const spaceId = unitIdByIdentifier[unitCode] ?? ''
          if (!tenantId) throw new Error(`Missing tenant ${tenantCode} in KODE OS`)
          if (!spaceId) throw new Error(`Missing unit ${unitCode} in KODE OS`)

          const startDate = normalizeLocalDate((c.uploadedRow as any)?.MOVE_IN_DATE)
          const endDate = normalizeLocalDate((c.uploadedRow as any)?.MOVE_OUT_DATE)

          const body: any = {
            tenantId,
            spaceIds: [spaceId],
            type: 'lease',
            exclusive: false,
          }
          if (startDate) body.startDate = startDate
          if (endDate) body.endDate = endDate

          await requestJson(`/api/space_assignments?buildingId=${encBuildingId}`, {
            method: 'POST',
            body,
          })
        },
      },
      {
        key: 'ts-patch',
        op: 'update' as const,
        label: 'Patch assignment dates',
        error: assignmentsError || null,
        candidates: tenantSpacePatchCandidates,
        run: async (c: UpdateCandidate<any, any>) => {
          const assignmentId = c.apiMutationId
          const startDate = normalizeLocalDate((c.uploadedRow as any)?.MOVE_IN_DATE) || null
          const endDate = normalizeLocalDate((c.uploadedRow as any)?.MOVE_OUT_DATE) || null

          await requestJson(
            `/api/space_assignment?buildingId=${encBuildingId}&assignmentId=${encodeURIComponent(assignmentId)}`,
            {
              method: 'PUT',
              body: { startDate, endDate },
            },
          )
        },
      },
      {
        key: 'ts-delete',
        op: 'delete' as const,
        label: 'Delete KODE-only assignments',
        error: assignmentsError || null,
        candidates: tenantSpaceDeleteCandidates,
        run: async (c: DeleteCandidate<any>) => {
          const assignmentId = c.apiMutationId
          await requestJson(
            `/api/space_assignment?buildingId=${encBuildingId}&assignmentId=${encodeURIComponent(assignmentId)}`,
            {
              method: 'DELETE',
            },
          )
        },
      },

      {
        key: 'ms-add',
        op: 'create' as const,
        label: 'Add missing meter assignments',
        error: meterAssignmentsError || null,
        candidates: meterSpaceCreateCandidates,
        run: async (c: CreateCandidate<any>) => {
          const meterIdentifier = normalizeKey((c.uploadedRow as any)?.identifier)
          const unitCode = normalizeKey((c.uploadedRow as any)?.unitCode)
          const meterId = meterIdByMeterIdentifier[meterIdentifier] ?? ''
          const spaceId = unitIdByIdentifier[unitCode] ?? ''

          if (!meterId) throw new Error(`Missing meter ${meterIdentifier} in KODE OS`)
          if (!spaceId) throw new Error(`Missing unit ${unitCode} in KODE OS`)

          await requestJson('/api/meter_assignments', {
            method: 'POST',
            body: {
              buildingId: selectedBuildingId,
              meterId,
              spaceId,
            },
          })
        },
      },
      {
        key: 'ms-delete',
        op: 'delete' as const,
        label: 'Delete KODE-only meter assignments',
        error: meterAssignmentsError || null,
        candidates: meterSpaceDeleteCandidates,
        run: async (c: DeleteCandidate<any>) => {
          const raw = (c.apiRow as any)?.raw ?? null
          const meterId = normalizeCode(raw?.meterId)
          const spaceId = normalizeCode(raw?.spaceId)
          if (!meterId || !spaceId) throw new Error('Missing meterId/spaceId in KODE assignment row')

          await requestJson('/api/meter_assignments', {
            method: 'DELETE',
            body: {
              buildingId: selectedBuildingId,
              meterId,
              spaceId,
            },
          })
        },
      },
    ]
  }, [
    assignmentsError,
    meterAssignmentsError,
    meterIdByMeterIdentifier,
    meterSpaceCreateCandidates,
    meterSpaceDeleteCandidates,
    selectedBuildingId,
    tenantIdByTenantCode,
    tenantSpaceCreateCandidates,
    tenantSpaceDeleteCandidates,
    tenantSpacePatchCandidates,
    unitIdByIdentifier,
  ])

  const assignmentsResolveDisabled =
    tenantSpaceCreateCandidates.length +
      tenantSpacePatchCandidates.length +
      tenantSpaceDeleteCandidates.length +
      meterSpaceCreateCandidates.length +
      meterSpaceDeleteCandidates.length ===
    0

  if (!propertyTable) {
    return (
      <Box style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text c="dimmed" size="sm">
          No property table uploaded. Upload the property table to use Audit.
        </Text>
      </Box>
    )
  }

  return (
    <>
      {headerRefresh}

      {selectedProperty && buildingsBySiteCode && matchedCodes.has(selectedProperty.code) && (
        <Box
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 20,
            background: 'white',
            marginLeft: 'calc(var(--mantine-spacing-xl) * -1)',
            marginRight: 'calc(var(--mantine-spacing-xl) * -1)',
            marginTop: 'calc(var(--mantine-spacing-xl) * -1)',
            padding: '12px var(--mantine-spacing-xl)',
            borderBottom: '1px solid #e6e6e6',
            boxShadow: '0 4px 8px rgba(0,0,0,0.12)',
          }}
        >
          <Group justify="space-between" align="center" wrap="nowrap">
            <Group gap={12} wrap="nowrap">
              <Box
                component="img"
                src={cfLogoUrl}
                alt="CF"
                style={{
                  width: 34,
                  height: 34,
                  objectFit: 'contain',
                  flex: '0 0 auto',
                }}
              />

              <Stack gap={2}>
                <Text fw={900} size="lg" style={{ lineHeight: 1.1, color: CF_GRAPH_COLOR }}>
                  {selectedPropertyDisplayName || '—'}
                </Text>

                <Text
                  fw={800}
                  size="sm"
                  style={{
                    color: 'var(--page-accent)',
                    letterSpacing: 0.5,
                  }}
                >
                  {selectedProperty.code}
                </Text>
              </Stack>
            </Group>

            <Group gap={12} wrap="nowrap">
              <Stack gap={2} align="flex-end">
                <Text fw={900} size="lg" style={{ lineHeight: 1.1, color: KODE_GRAPH_COLOR, textAlign: 'right' }}>
                  {buildingName || '—'}
                </Text>

                <Text size="xs" c="dimmed">
                  {selectedBuildingId || ''}
                </Text>
              </Stack>

              <Box
                component="img"
                src={kodeLogoUrl}
                alt="KODE"
                style={{
                  width: 34,
                  height: 34,
                  objectFit: 'contain',
                  flex: '0 0 auto',
                }}
              />
            </Group>
          </Group>
        </Box>
      )}

      <Stack gap="md">
        {buildingsLoading && (
          <Group gap="sm" wrap="nowrap">
            <Loader size="sm" />
            <Text size="sm">Loading buildings…</Text>
          </Group>
        )}

        {buildingsError && (
          <Text size="sm" c="dimmed">
            Buildings API error: {buildingsError}
          </Text>
        )}

        {!selectedProperty && (
          <Box style={{ minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed" size="sm">
              Select a property from the sidebar.
            </Text>
          </Box>
        )}

        {selectedProperty && !buildingsBySiteCode && !buildingsError && (
          <Text c="dimmed" size="sm">
            Waiting for buildings to load…
          </Text>
        )}

        {selectedProperty && buildingsBySiteCode && !matchedCodes.has(selectedProperty.code) && (
          <Box style={{ minHeight: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text c="dimmed" size="sm">
              No matching building found for {selectedProperty.code}.
            </Text>
          </Box>
        )}

        {selectedProperty && buildingsBySiteCode && matchedCodes.has(selectedProperty.code) && (
          <Stack gap="md" pt="md">
            <Paper withBorder p={0} radius="md">
              {(tenantsLoading || !tenantTable) && (
                <Box
                  style={{
                    backgroundImage: 'var(--page-accent-bg)',
                    borderTopLeftRadius: 'var(--mantine-radius-md)',
                    borderTopRightRadius: 'var(--mantine-radius-md)',
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    padding: '10px 12px',
                  }}
                >
                  <Text fw={900} size="lg" c="white">
                    Tenants
                  </Text>
                </Box>
              )}

              {(tenantsLoading || !tenantTable) && (
                <Box style={{ padding: 'var(--mantine-spacing-md)' }}>
                  <Stack gap="sm">
                    {tenantsLoading && (
                      <Text size="sm" c="dimmed">
                        Loading tenants…
                      </Text>
                    )}

                    {!tenantTable && (
                      <Text size="sm" c="dimmed">
                        No tenant table uploaded. Upload the tenant table to compare tenants.
                      </Text>
                    )}
                  </Stack>
                </Box>
              )}

              {!tenantsLoading && tenantTable && (
                <TenantsCompareChart
                  uploadedTenants={uploadedTenants}
                  apiTenants={apiTenants}
                  propertyCodeByBuildingId={propertyCodeByBuildingId}
                  buildingId={selectedBuildingId}
                  onResolveComplete={refreshTenants}
                  apiError={tenantsError}
                />
              )}
            </Paper>

            <Paper withBorder p={0} radius="md">
              <SpacesResolveDifferencesModal
                opened={spacesResolveOpened}
                onClose={() => setSpacesResolveOpened(false)}
                title="Resolve Spaces differences"
                sections={spacesResolveSections}
              />

              <Box
                style={{
                  backgroundImage: 'var(--page-accent-bg)',
                  borderTopLeftRadius: 'var(--mantine-radius-md)',
                  borderTopRightRadius: 'var(--mantine-radius-md)',
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  overflow: 'hidden',
                }}
              >
                <Group justify="space-between" align="stretch" wrap="nowrap" gap={0}>
                  <Box style={{ padding: '10px 12px', minWidth: 0, flex: 1 }}>
                    <Text fw={900} size="lg" c="white">
                      Spaces
                    </Text>
                  </Box>

                  <Box style={{ alignSelf: 'stretch', display: 'flex' }}>
                    <button
                      type="button"
                      className="accent-header-action-button"
                      onClick={() => setSpacesResolveOpened(true)}
                      disabled={
                        missingFloorCandidates.length +
                          missingUnitCandidates.length +
                          patchUnitCandidates.length +
                          deleteFloorCandidates.length +
                          deleteUnitCandidates.length ===
                        0
                      }
                    >
                      Resolve differences
                    </button>
                  </Box>
                </Group>
              </Box>

              <Box
                style={{
                  paddingLeft: 'var(--mantine-spacing-md)',
                  paddingRight: 'var(--mantine-spacing-md)',
                  paddingBottom: 'var(--mantine-spacing-md)',
                  paddingTop: 'calc(var(--mantine-spacing-md) + 4px)',
                }}
              >
                <Stack gap="sm">
                  {floorTable && !floorsReady && (
                    <Text size="sm" c="dimmed">
                      Loading floors…
                    </Text>
                  )}

                  {!floorTable && (
                    <Text size="sm" c="dimmed">
                      No floor table uploaded. Upload the floor table to compare floors.
                    </Text>
                  )}

                  {floorsReady && !floorsLoading && floorTable && (
                    <EntityCompareChart
                      heading="Floors"
                      headingLevel="sub"
                      entityPluralLabel="Floors"
                      identifierLabel="Floor code"
                      uploadedRows={uploadedFloors as any[]}
                      apiRows={apiFloors as any[]}
                      apiError={floorsError}
                      ctx={{}}
                      uploadedId={{
                        label: 'Floor code',
                        get: (row) => (row as any)?.FLOOR_CODE,
                        normalize: normalizeKey,
                      }}
                      apiId={{
                        label: 'Floor code',
                        get: (row) => (row as any)?.identifier,
                        normalize: normalizeKey,
                      }}
                      metadata={[]}
                    />
                  )}

                  {unitTable && !floorsReady && (
                    <Text size="sm" c="dimmed">
                      Loading floor mapping…
                    </Text>
                  )}

                  {unitTable && !unitsReady && floorsReady && (
                    <Text size="sm" c="dimmed">
                      Loading units…
                    </Text>
                  )}

                  {unitsLoading && unitsReady && (
                    <Text size="sm" c="dimmed">
                      Loading units…
                    </Text>
                  )}

                  {!unitTable && (
                    <Text size="sm" c="dimmed">
                      No unit table uploaded. Upload the unit table to compare units.
                    </Text>
                  )}

                  {floorsReady && unitsReady && !unitsLoading && unitTable && (
                    <EntityCompareChart
                      heading="Units"
                      headingLevel="sub"
                      entityPluralLabel="Units"
                      identifierLabel="Unit code"
                      uploadedRows={uploadedUnits as any[]}
                      apiRows={apiUnits as any[]}
                      apiError={unitsCompareError}
                      ctx={{ levelIdentifierById }}
                      uploadedId={{
                        label: 'Unit code',
                        get: (row) => (row as any)?.UNIT_CODE,
                        normalize: normalizeKey,
                      }}
                      apiId={{
                        label: 'Unit code',
                        get: (row) => (row as any)?.identifier,
                        normalize: normalizeKey,
                      }}
                      metadata={unitMetadata as any}
                    />
                  )}
                </Stack>
              </Box>
            </Paper>

            <Paper withBorder p={0} radius="md">
              <AssignmentsResolveDifferencesModal
                opened={assignmentsResolveOpened}
                onClose={() => setAssignmentsResolveOpened(false)}
                title="Resolve Assignments differences"
                sections={assignmentsResolveSections}
              />

              <Box
                style={{
                  backgroundImage: 'var(--page-accent-bg)',
                  borderTopLeftRadius: 'var(--mantine-radius-md)',
                  borderTopRightRadius: 'var(--mantine-radius-md)',
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                  overflow: 'hidden',
                }}
              >
                <Group justify="space-between" align="stretch" wrap="nowrap" gap={0}>
                  <Box style={{ padding: '10px 12px', minWidth: 0, flex: 1 }}>
                    <Text fw={900} size="lg" c="white">
                      Assignments
                    </Text>
                  </Box>

                  <Box style={{ alignSelf: 'stretch', display: 'flex' }}>
                    <button
                      type="button"
                      className="accent-header-action-button"
                      onClick={() => setAssignmentsResolveOpened(true)}
                      disabled={assignmentsResolveDisabled}
                    >
                      Resolve differences
                    </button>
                  </Box>
                </Group>
              </Box>

              <Box
                style={{
                  paddingLeft: 'var(--mantine-spacing-md)',
                  paddingRight: 'var(--mantine-spacing-md)',
                  paddingBottom: 'var(--mantine-spacing-md)',
                  paddingTop: 'calc(var(--mantine-spacing-md) + 4px)',
                }}
              >
                <Stack gap="sm">
                  {tenantTable && !unitsReady && (
                    <Text size="sm" c="dimmed">
                      Loading units mapping…
                    </Text>
                  )}

                  {tenantTable && !assignmentsReady && (
                    <Text size="sm" c="dimmed">
                      Loading assignments…
                    </Text>
                  )}

                  {assignmentsLoading && assignmentsReady && (
                    <Text size="sm" c="dimmed">
                      Loading assignments…
                    </Text>
                  )}

                  {!tenantTable && (
                    <Text size="sm" c="dimmed">
                      No tenant table uploaded. Upload the tenant table to compare tenant ↔ space assignments.
                    </Text>
                  )}

                  {tenantTable && unitsReady && assignmentsReady && !assignmentsLoading && (
                    <EntityCompareChart
                      heading="Tenant ↔ Space"
                      headingLevel="sub"
                      entityPluralLabel="Assignments"
                      identifierLabel="Tenant + unit"
                      uploadedRows={uploadedTenants as any[]}
                      apiRows={apiTenantSpaceAssignments as any[]}
                      apiError={assignmentsError}
                      ctx={{}}
                      uploadedId={{
                        label: 'Tenant + unit',
                        get: (row) => {
                          const tenantCode = normalizeKey((row as any)?.TENANT_CODE)
                          const unitCode = normalizeKey((row as any)?.UNIT_CODE)
                          if (!tenantCode || !unitCode) return ''
                          return `${tenantCode}|${unitCode}`
                        },
                        normalize: normalizeKey,
                      }}
                      apiId={{
                        label: 'Tenant + unit',
                        get: (row) => {
                          const tenantCode = normalizeKey((row as any)?.tenantCode)
                          const unitCode = normalizeKey((row as any)?.unitCode)
                          if (!tenantCode || !unitCode) return ''
                          return `${tenantCode}|${unitCode}`
                        },
                        normalize: normalizeKey,
                      }}
                      metadata={[
                        {
                          key: 'startDate',
                          label: 'Start date',
                          getUploaded: (row) => normalizeLocalDate((row as any)?.MOVE_IN_DATE),
                          getApi: (row) => normalizeLocalDate((row as any)?.startDate),
                          normalize: normalizeLocalDate,
                        },
                        {
                          key: 'endDate',
                          label: 'End date',
                          getUploaded: (row) => normalizeLocalDate((row as any)?.MOVE_OUT_DATE),
                          getApi: (row) => normalizeLocalDate((row as any)?.endDate),
                          normalize: normalizeLocalDate,
                        },
                      ]}
                    />
                  )}

                  <Box style={{ paddingTop: 6 }}>
                    <Stack gap={8} pt={6}>
                      {!carmaMeterAssignmentTable && (
                        <Text size="sm" c="dimmed">
                          No carma meter_assignment table uploaded. Upload the CARMA meter_assignment table to compare
                          meter ↔ space assignments.
                        </Text>
                      )}

                      {carmaMeterAssignmentTable && !unitsReady && (
                        <Text size="sm" c="dimmed">
                          Loading spaces mapping…
                        </Text>
                      )}

                      {carmaMeterAssignmentTable && !meterAssignmentsReady && (
                        <Text size="sm" c="dimmed">
                          Loading meter assignments…
                        </Text>
                      )}

                      {meterAssignmentsLoading && meterAssignmentsReady && (
                        <Text size="sm" c="dimmed">
                          Loading meter assignments…
                        </Text>
                      )}

                      {carmaMeterAssignmentTable && unitsReady && meterAssignmentsReady && !meterAssignmentsLoading && (
                        <EntityCompareChart
                          heading="Meter ↔ Space"
                          headingLevel="sub"
                          entityPluralLabel="Meter assignments"
                          identifierLabel="Meter + unit"
                          uploadedRows={uploadedMeterSpaceAssignments as any[]}
                          apiRows={apiMeterSpaceAssignments as any[]}
                          apiError={meterAssignmentsError}
                          ctx={{}}
                          uploadedId={{
                            label: 'Meter + unit',
                            get: (row) => {
                              const meterIdentifier = normalizeKey((row as any)?.identifier)
                              const unitCode = normalizeKey((row as any)?.unitCode)
                              if (!meterIdentifier || !unitCode) return ''
                              return `${meterIdentifier}|${unitCode}`
                            },
                            normalize: normalizeKey,
                          }}
                          apiId={{
                            label: 'Meter + unit',
                            get: (row) => {
                              const meterIdentifier = normalizeKey((row as any)?.identifier)
                              const unitCode = normalizeKey((row as any)?.unitCode)
                              if (!meterIdentifier || !unitCode) return ''
                              return `${meterIdentifier}|${unitCode}`
                            },
                            normalize: normalizeKey,
                          }}
                          metadata={[]}
                        />
                      )}
                    </Stack>
                  </Box>
                </Stack>
              </Box>
            </Paper>
          </Stack>
        )}
      </Stack>
    </>
  )
}
