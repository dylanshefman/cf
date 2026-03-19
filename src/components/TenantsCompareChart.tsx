import { requestJson } from '../utils/api'
import { EntityCompareChart } from './compare/EntityCompareChart'
import type { ResolveConfig } from './compare/compareTypes'

function normalizeTenantKey(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  return s.trim().toUpperCase()
}

function normalizeBuildingId(value: unknown): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  return s.trim()
}

function trimString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function getTenantId(raw: any): string {
  const id = raw?._id ?? raw?.id ?? raw?.tenantId
  return id ? String(id).trim() : ''
}

function getFirstBuildingId(raw: any): string {
  const buildingIds = Array.isArray(raw?.buildingIds) ? raw.buildingIds : []
  return normalizeBuildingId(buildingIds[0])
}

export type TenantsCompareChartProps = {
  uploadedTenants: unknown[]
  apiTenants: unknown[]
  propertyCodeByBuildingId: Record<string, string>
  buildingId: string
  onResolveComplete?: () => void
  apiError?: string | null
}

type TenantsCtx = {
  buildingId: string
  propertyCodeByBuildingId: Record<string, string>
}

export function TenantsCompareChart({
  uploadedTenants,
  apiTenants,
  propertyCodeByBuildingId,
  buildingId,
  onResolveComplete,
  apiError = null,
}: TenantsCompareChartProps) {
  const ctx: TenantsCtx = { buildingId, propertyCodeByBuildingId }

  const resolve: ResolveConfig<any, any, TenantsCtx> = {
    validateBeforeRun: (c) => {
      if (!c.buildingId) return 'Missing buildingId.'
      return null
    },
    onComplete: onResolveComplete,
    create: {
      label: 'Create in KODE OS (CF only)',
      getSecondaryText: (row) => trimString((row as any)?.TENANT_NAME),
      run: async ({ identifier, uploadedRow, ctx }) => {
        const encBuildingId = encodeURIComponent(ctx.buildingId)
        const name = trimString((uploadedRow as any)?.TENANT_NAME)
        const description = trimString((uploadedRow as any)?.TENANT_TYPE)
        await requestJson(`/api/tenants?buildingId=${encBuildingId}`, {
          method: 'POST',
          body: {
            identifier,
            name,
            description,
            buildingIds: [ctx.buildingId],
          },
        })
      },
    },
    update: {
      label: 'Update metadata in KODE OS (mismatch)',
      getApiMutationId: (row) => getTenantId(row),
      getSecondaryText: ({ uploadedRow }) => trimString((uploadedRow as any)?.TENANT_NAME),
      run: async ({ identifier, uploadedRow, apiMutationId, ctx }) => {
        const encBuildingId = encodeURIComponent(ctx.buildingId)
        const name = trimString((uploadedRow as any)?.TENANT_NAME)
        const description = trimString((uploadedRow as any)?.TENANT_TYPE)
        await requestJson(`/api/tenant?buildingId=${encBuildingId}&tenantId=${encodeURIComponent(apiMutationId)}`, {
          method: 'PUT',
          body: {
            identifier,
            name,
            description,
            buildingIds: [ctx.buildingId],
          },
        })
      },
    },
    delete: {
      label: 'Delete from KODE OS (KODE only)',
      getApiMutationId: (row) => getTenantId(row),
      getSecondaryText: (row) => trimString((row as any)?.name),
      run: async ({ apiMutationId, ctx }) => {
        const encBuildingId = encodeURIComponent(ctx.buildingId)
        await requestJson(`/api/tenant?buildingId=${encBuildingId}&tenantId=${encodeURIComponent(apiMutationId)}`, {
          method: 'DELETE',
        })
      },
    },
  }

  return (
    <EntityCompareChart
      heading="Tenants"
      headingLevel="section"
      entityPluralLabel="Tenants"
      identifierLabel="Code"
      uploadedRows={uploadedTenants as any[]}
      apiRows={apiTenants as any[]}
      apiError={apiError}
      ctx={ctx}
      uploadedId={{
        label: 'Code',
        get: (row) => (row as any)?.TENANT_CODE,
        normalize: normalizeTenantKey,
      }}
      apiId={{
        label: 'Code',
        get: (row) => (row as any)?.identifier,
        normalize: normalizeTenantKey,
      }}
      metadata={[
        {
          key: 'name',
          label: 'Name',
          getUploaded: (row) => (row as any)?.TENANT_NAME,
          getApi: (row) => (row as any)?.name,
          normalize: normalizeTenantKey,
        },
        {
          key: 'type',
          label: 'Type',
          getUploaded: (row) => (row as any)?.TENANT_TYPE,
          getApi: (row) => (row as any)?.description,
          normalize: normalizeTenantKey,
        },
        {
          key: 'propertyCode',
          label: 'Property',
          getUploaded: (row) => (row as any)?.PROPERTY_CODE,
          getApi: (row, ctx) => {
            const buildingId = getFirstBuildingId(row)
            return ctx.propertyCodeByBuildingId[buildingId] ?? ''
          },
          normalize: normalizeTenantKey,
        },
      ]}
      resolve={resolve}
    />
  )
}
