export type CompareSegmentKey = 'cf' | 'both' | 'mismatch' | 'kode'

export type CompareCounts = {
  onlyCf: number
  both: number
  metaMismatch: number
  onlyKode: number
  union: number
}

export type IdentifierSpec<Row, Ctx> = {
  label: string
  field?: string
  get?: (row: Row, ctx: Ctx) => unknown
  normalize?: (value: unknown) => string
}

export type MetadataFieldSpec<UploadedRow, ApiRow, Ctx> = {
  key: string
  label: string
  uploadedField?: string
  apiField?: string
  getUploaded?: (row: UploadedRow, ctx: Ctx) => unknown
  getApi?: (row: ApiRow, ctx: Ctx) => unknown
  normalize?: (value: unknown) => string
}

export type ComparisonBothRow<UploadedRow, ApiRow> = {
  identifier: string
  meta: Record<string, string>
  uploadedRow: UploadedRow
  apiRow: ApiRow
}

export type ComparisonMismatchRow<UploadedRow, ApiRow> = {
  identifier: string
  metaUploaded: Record<string, string>
  metaApi: Record<string, string>
  mismatchedKeys: string[]
  uploadedRow: UploadedRow
  apiRow: ApiRow
}

export type CompareDetails<UploadedRow, ApiRow> = {
  cfOnly: UploadedRow[]
  kodeOnly: ApiRow[]
  both: Array<ComparisonBothRow<UploadedRow, ApiRow>>
  mismatch: Array<ComparisonMismatchRow<UploadedRow, ApiRow>>
}

export type ResolveOpKey = 'create' | 'update' | 'delete'

export type ResolveRunResult = {
  op: ResolveOpKey
  identifier: string
  status: 'ok' | 'error'
  message?: string
}

export type ResolveCandidateBase = {
  key: string
  identifier: string
  secondaryText: string
  disabledReason?: string
}

export type CreateCandidate<UploadedRow> = ResolveCandidateBase & {
  uploadedRow: UploadedRow
}

export type UpdateCandidate<UploadedRow, ApiRow> = ResolveCandidateBase & {
  uploadedRow: UploadedRow
  apiRow: ApiRow
  apiMutationId: string
}

export type DeleteCandidate<ApiRow> = ResolveCandidateBase & {
  apiRow: ApiRow
  apiMutationId: string
}

export type ResolveConfig<UploadedRow, ApiRow, Ctx> = {
  validateBeforeRun?: (ctx: Ctx) => string | null
  onComplete?: () => void

  create?: {
    label: string
    getSecondaryText?: (row: UploadedRow, ctx: Ctx) => string
    run: (args: { identifier: string; uploadedRow: UploadedRow; ctx: Ctx }) => Promise<void>
  }

  update?: {
    label: string
    getApiMutationId: (row: ApiRow, ctx: Ctx) => string
    getSecondaryText?: (args: { identifier: string; uploadedRow: UploadedRow; apiRow: ApiRow; ctx: Ctx }) => string
    run: (args: { identifier: string; uploadedRow: UploadedRow; apiRow: ApiRow; apiMutationId: string; ctx: Ctx }) => Promise<void>
  }

  delete?: {
    label: string
    getApiMutationId: (row: ApiRow, ctx: Ctx) => string
    getSecondaryText?: (row: ApiRow, ctx: Ctx) => string
    run: (args: { identifier: string; apiRow: ApiRow; apiMutationId: string; ctx: Ctx }) => Promise<void>
  }
}
