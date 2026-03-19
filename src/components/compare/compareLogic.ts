import type { CompareCounts, CompareDetails, IdentifierSpec, MetadataFieldSpec } from './compareTypes'

function defaultNormalizeKey(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

function defaultNormalizeMeta(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function buildIndex<Row, Ctx>(
  rows: Row[],
  spec: IdentifierSpec<Row, Ctx>,
  ctx: Ctx,
): { byId: Map<string, Row>; unkeyed: Row[] } {
  const normalize = spec.normalize ?? defaultNormalizeKey
  const byId = new Map<string, Row>()
  const unkeyed: Row[] = []

  for (const row of rows) {
    const raw = spec.get ? spec.get(row, ctx) : spec.field ? (row as any)?.[spec.field] : undefined
    const key = normalize(raw)
    if (!key) {
      unkeyed.push(row)
      continue
    }

    if (byId.has(key)) continue
    byId.set(key, row)
  }

  return { byId, unkeyed }
}

export function computeMetaValue<Row, Ctx>(
  row: Row,
  ctx: Ctx,
  get: ((row: Row, ctx: Ctx) => unknown) | undefined,
  field: string | undefined,
  normalize?: (value: unknown) => string,
): string {
  const norm = normalize ?? defaultNormalizeMeta
  const raw = get ? get(row, ctx) : field ? (row as any)?.[field] : undefined
  return norm(raw)
}

export function compareRows<UploadedRow, ApiRow, Ctx>(args: {
  uploadedRows: UploadedRow[]
  apiRows: ApiRow[]
  ctx: Ctx
  uploadedId: IdentifierSpec<UploadedRow, Ctx>
  apiId: IdentifierSpec<ApiRow, Ctx>
  metadata: Array<MetadataFieldSpec<UploadedRow, ApiRow, Ctx>>
}): { counts: CompareCounts; details: CompareDetails<UploadedRow, ApiRow> } {
  const { uploadedRows, apiRows, ctx, uploadedId, apiId, metadata } = args

  const uploadedIndex = buildIndex(uploadedRows, uploadedId, ctx)
  const apiIndex = buildIndex(apiRows, apiId, ctx)

  const cfOnly: UploadedRow[] = [...uploadedIndex.unkeyed]
  const kodeOnly: ApiRow[] = [...apiIndex.unkeyed]
  const both: CompareDetails<UploadedRow, ApiRow>['both'] = []
  const mismatch: CompareDetails<UploadedRow, ApiRow>['mismatch'] = []

  for (const [identifier, uploadedRow] of uploadedIndex.byId.entries()) {
    const apiRow = apiIndex.byId.get(identifier)
    if (!apiRow) {
      cfOnly.push(uploadedRow)
      continue
    }

    const metaUploaded: Record<string, string> = {}
    const metaApi: Record<string, string> = {}
    const mismatchedKeys: string[] = []

    for (const field of metadata) {
      const u = computeMetaValue(uploadedRow, ctx, field.getUploaded, field.uploadedField, field.normalize)
      const a = computeMetaValue(apiRow, ctx, field.getApi, field.apiField, field.normalize)
      metaUploaded[field.key] = u
      metaApi[field.key] = a
      if (u !== a) mismatchedKeys.push(field.key)
    }

    if (mismatchedKeys.length === 0) {
      const merged: Record<string, string> = {}
      for (const field of metadata) merged[field.key] = metaUploaded[field.key]
      both.push({ identifier, meta: merged, uploadedRow, apiRow })
    } else {
      mismatch.push({ identifier, metaUploaded, metaApi, mismatchedKeys, uploadedRow, apiRow })
    }
  }

  for (const [identifier, apiRow] of apiIndex.byId.entries()) {
    if (uploadedIndex.byId.has(identifier)) continue
    kodeOnly.push(apiRow)
  }

  const counts: CompareCounts = {
    onlyCf: cfOnly.length,
    both: both.length,
    metaMismatch: mismatch.length,
    onlyKode: kodeOnly.length,
    union: cfOnly.length + both.length + mismatch.length + kodeOnly.length,
  }

  both.sort((a, b) => a.identifier.localeCompare(b.identifier))
  mismatch.sort((a, b) => a.identifier.localeCompare(b.identifier))

  return { counts, details: { cfOnly, kodeOnly, both, mismatch } }
}
