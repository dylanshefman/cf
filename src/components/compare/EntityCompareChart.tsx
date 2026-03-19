import { Badge, Box, Collapse, Group, Stack, Text } from '@mantine/core'
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { IconAlertTriangle, IconCheck, IconDownload } from '@tabler/icons-react'
import { compareRows } from './compareLogic'
import type {
  CompareSegmentKey,
  CreateCandidate,
  DeleteCandidate,
  IdentifierSpec,
  MetadataFieldSpec,
  ResolveConfig,
  UpdateCandidate,
} from './compareTypes'
import { CompareStackedBar } from './CompareStackedBar'
import { CompareDetailsTable, getCompareDetailsTitle } from './CompareDetailsTable'
import { ResolveDifferencesModal } from './ResolveDifferencesModal'
import { CF_GRAPH_COLOR, KODE_GRAPH_COLOR } from '../../utils/graphColors'

type HeadingLevel = 'section' | 'sub'

export type EntityCompareChartProps<UploadedRow, ApiRow, Ctx> = {
  heading: string
  headingLevel?: HeadingLevel
  entityPluralLabel: string

  identifierLabel?: string

  uploadedRows: UploadedRow[]
  apiRows: ApiRow[]
  apiError?: string | null

  ctx: Ctx
  uploadedId: IdentifierSpec<UploadedRow, Ctx>
  apiId: IdentifierSpec<ApiRow, Ctx>
  metadata: Array<MetadataFieldSpec<UploadedRow, ApiRow, Ctx>>

  resolve?: ResolveConfig<UploadedRow, ApiRow, Ctx>
}

function trimString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

function defaultNormalizeIdentifier(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

function normalizeIdentifier<Row, Ctx>(spec: IdentifierSpec<Row, Ctx>, value: unknown): string {
  const normalize = spec.normalize ?? defaultNormalizeIdentifier
  return normalize(value)
}

function readIdentifier<Row, Ctx>(spec: IdentifierSpec<Row, Ctx>, row: Row, ctx: Ctx): unknown {
  if (spec.get) return spec.get(row, ctx)
  if (spec.field) return (row as any)?.[spec.field]
  return undefined
}

export function EntityCompareChart<UploadedRow, ApiRow, Ctx>({
  heading,
  headingLevel = 'sub',
  entityPluralLabel,
  identifierLabel,
  uploadedRows,
  apiRows,
  apiError = null,
  ctx,
  uploadedId,
  apiId,
  metadata,
  resolve,
}: EntityCompareChartProps<UploadedRow, ApiRow, Ctx>) {
  const collapseDurationMs = 550
  const { counts, details } = useMemo(() => {
    return compareRows({ uploadedRows, apiRows, ctx, uploadedId, apiId, metadata })
  }, [apiId, apiRows, ctx, metadata, uploadedId, uploadedRows])

  const [openedSeg, setOpenedSeg] = useState<CompareSegmentKey | null>(null)
  const [resolveOpened, setResolveOpened] = useState(false)

  // Used to keep the originating chart label hidden during the return animation,
  // even after the table collapses (openedSeg becomes null).
  const [returningSeg, setReturningSeg] = useState<CompareSegmentKey | null>(null)

  const activeColorSeg = openedSeg ?? returningSeg

  const headerBg = useMemo(() => {
    if (!activeColorSeg) return 'transparent'
    if (activeColorSeg === 'cf') return CF_GRAPH_COLOR
    if (activeColorSeg === 'kode') return KODE_GRAPH_COLOR
    if (activeColorSeg === 'both') return 'var(--mantine-color-green-filled)'
    return 'var(--mantine-color-yellow-filled)'
  }, [activeColorSeg])

  const [headerFg, setHeaderFg] = useState<'#000' | '#fff'>('#fff')

  function resolveCssVarColor(value: string): string {
    const m = value.match(/var\((--[^),\s]+)(?:\s*,[^)]+)?\)/)
    const varName = m?.[1]
    if (!varName || typeof window === 'undefined') return value
    const resolved = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
    return resolved || value
  }

  function parseRgb(value: string): { r: number; g: number; b: number } | null {
    const v = value.trim().toLowerCase()
    const rgb = v.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/)
    if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) }

    const hex = v.match(/^#([0-9a-f]{6})$/)
    if (hex) {
      const n = parseInt(hex[1], 16)
      return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
    }

    return null
  }

  function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
    const srgb = [r, g, b].map((c) => {
      const v = c / 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    })
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  }

  useLayoutEffect(() => {
    if (!activeColorSeg) return
    if (typeof window === 'undefined') return

    const resolved = resolveCssVarColor(headerBg)
    const rgb = parseRgb(resolved)
    if (!rgb) {
      setHeaderFg('#fff')
      return
    }

    const lum = relativeLuminance(rgb)
    // If background is light, use black; otherwise use white.
    setHeaderFg(lum > 0.52 ? '#000' : '#fff')
  }, [activeColorSeg, headerBg])

  function csvEscape(value: unknown): string {
    if (value === null || value === undefined) return ''
    const s = typeof value === 'string' ? value : String(value)
    const escaped = s.replace(/"/g, '""')
    if (escaped.search(/[",\n]/) >= 0) return `"${escaped}"`
    return escaped
  }

  function buildCsvForSegment(seg: CompareSegmentKey | null): string {
    if (!seg) return ''

    if (seg === 'cf' || seg === 'kode') {
      const rows = seg === 'cf' ? (details.cfOnly as any[]) : (details.kodeOnly as any[])
      if (!rows || rows.length === 0) return ''
      const cols = Object.keys(rows[0])
      const header = cols.map(csvEscape).join(',')
      const body = rows
        .map((r) => cols.map((c) => csvEscape((r as any)[c])).join(','))
        .join('\n')
      return header + '\n' + body
    }

    if (seg === 'both') {
      const cols = [identifierLabel ?? 'identifier', ...metadata.map((m) => m.label)]
      const header = cols.map(csvEscape).join(',')
      const body = (details.both as any[])
        .map((r) => [r.identifier, ...metadata.map((m) => r.meta[m.key] ?? '')].map(csvEscape).join(','))
        .join('\n')
      return header + '\n' + body
    }

    // mismatch
    if (seg === 'mismatch') {
      const cols: string[] = []
      cols.push(identifierLabel ?? 'identifier')
      for (const m of metadata) {
        cols.push(`${m.label} (CF)`, `${m.label} (KODE)`)
      }

      const header = cols.map(csvEscape).join(',')
      const body = (details.mismatch as any[])
        .map((r) => [r.identifier, ...metadata.flatMap((m) => [r.metaUploaded[m.key] ?? '', r.metaApi[m.key] ?? ''])].map(csvEscape).join(','))
        .join('\n')
      return header + '\n' + body
    }

    return ''
  }

  function handleExportCsv(seg: CompareSegmentKey | null) {
    try {
      const csv = buildCsvForSegment(seg)
      if (!csv) return
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const fname = `${(entityPluralLabel || 'table').replace(/\s+/g, '_')}-${getCompareDetailsTitle(seg)}.csv`
      a.download = fname
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      // ignore
    }
  }

  const toggleStartMsRef = useRef<number | null>(null)
  const [floatingDurationMs, setFloatingDurationMs] = useState<number>(collapseDurationMs)

  const labelElsRef = useRef<Record<CompareSegmentKey, HTMLDivElement | null>>({
    cf: null,
    both: null,
    mismatch: null,
    kode: null,
  })
  const labelPartsRef = useRef<
    Record<CompareSegmentKey, { container: HTMLDivElement | null; title: HTMLSpanElement | null; count: HTMLSpanElement | null }>
  >({
    cf: { container: null, title: null, count: null },
    both: { container: null, title: null, count: null },
    mismatch: { container: null, title: null, count: null },
    kode: { container: null, title: null, count: null },
  })
  const headerAnchorRef = useRef<HTMLDivElement | null>(null)
  const headerTitleRef = useRef<HTMLSpanElement | null>(null)
  const headerCountRef = useRef<HTMLSpanElement | null>(null)

  const [floatingPhase, setFloatingPhase] = useState<null | 'opening' | 'closing'>(null)
  const [floatingSeg, setFloatingSeg] = useState<CompareSegmentKey | null>(null)
  const [floatingTitleText, setFloatingTitleText] = useState('')
  const [floatingCountText, setFloatingCountText] = useState('')

  const [floatingTitlePos, setFloatingTitlePos] = useState<null | { left: number; top: number; width: number; height: number }>(
    null,
  )
  const [floatingCountPos, setFloatingCountPos] = useState<null | { left: number; top: number; width: number; height: number }>(
    null,
  )

  const [floatingTitleToHeader, setFloatingTitleToHeader] = useState(false)
  const [floatingCountToHeader, setFloatingCountToHeader] = useState(false)
  const [hideHeaderContent, setHideHeaderContent] = useState(false)
  const [pendingOpen, setPendingOpen] = useState<
    | null
    | {
        seg: CompareSegmentKey
        label: string
        count: number
        fromTitle: { left: number; top: number; width: number; height: number } | null
        fromCount: { left: number; top: number; width: number; height: number } | null
      }
  >(null)

  const detailsOpen = openedSeg !== null

  const selectedLabel = getCompareDetailsTitle(openedSeg)
  const selectedCount = useMemo(() => {
    if (!openedSeg) return 0
    if (openedSeg === 'cf') return counts.onlyCf
    if (openedSeg === 'kode') return counts.onlyKode
    if (openedSeg === 'mismatch') return counts.metaMismatch
    return counts.both
  }, [counts.both, counts.metaMismatch, counts.onlyCf, counts.onlyKode, openedSeg])

  function rectToPlain(r: DOMRect) {
    return { left: r.left, top: r.top, width: r.width, height: r.height }
  }

  function clearFloating() {
    setFloatingPhase(null)
    setFloatingSeg(null)
    setFloatingTitleText('')
    setFloatingCountText('')
    setFloatingTitlePos(null)
    setFloatingCountPos(null)
    setFloatingTitleToHeader(false)
    setFloatingCountToHeader(false)
    setFloatingDurationMs(collapseDurationMs)
  }

  const requestClose = () => {
    if (!openedSeg) return

    toggleStartMsRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setFloatingDurationMs(collapseDurationMs)

    const headerTitleEl = headerTitleRef.current
    const headerCountEl = headerCountRef.current
    const parts = labelPartsRef.current[openedSeg]

    if (!headerTitleEl || !headerCountEl || !parts.title || !parts.count) {
      setOpenedSeg(null)
      return
    }

    const label = getCompareDetailsTitle(openedSeg)
    const count = String(selectedCount)

    const fromTitleRect = headerTitleEl.getBoundingClientRect()
    const fromCountRect = headerCountEl.getBoundingClientRect()
    const toTitleRect = parts.title.getBoundingClientRect()
    const toCountRect = parts.count.getBoundingClientRect()

    // Start collapsing immediately; keep the chart label hidden until the return
    // animation finishes so we don't see two labels at once.
    setReturningSeg(openedSeg)
    setOpenedSeg(null)

    setHideHeaderContent(true)
    setFloatingPhase('closing')
    setFloatingSeg(openedSeg)
    setFloatingTitleText(label)
    setFloatingCountText(count)

    setFloatingTitleToHeader(true)
    setFloatingCountToHeader(true)

    setFloatingTitlePos(rectToPlain(fromTitleRect))
    setFloatingCountPos(rectToPlain(fromCountRect))

    requestAnimationFrame(() => {
      setFloatingTitleToHeader(false)
      setFloatingCountToHeader(false)
      setFloatingTitlePos(rectToPlain(toTitleRect))
      setFloatingCountPos(rectToPlain(toCountRect))
    })
  }

  const handleSegmentClick = (seg: CompareSegmentKey) => {
    if (openedSeg === seg) {
      requestClose()
      return
    }

    // If switching while open, just switch selections (no fly animation).
    if (openedSeg && openedSeg !== seg) {
      setOpenedSeg(seg)
      return
    }

    toggleStartMsRef.current = typeof performance !== 'undefined' ? performance.now() : Date.now()
    setFloatingDurationMs(collapseDurationMs)

    const parts = labelPartsRef.current[seg]
    const titleRect = parts.title?.getBoundingClientRect() ?? null
    const countRect = parts.count?.getBoundingClientRect() ?? null
    const label = getCompareDetailsTitle(seg)
    const count = seg === 'cf' ? counts.onlyCf : seg === 'kode' ? counts.onlyKode : seg === 'mismatch' ? counts.metaMismatch : counts.both

    setPendingOpen({
      seg,
      label,
      count,
      fromTitle: titleRect ? rectToPlain(titleRect) : null,
      fromCount: countRect ? rectToPlain(countRect) : null,
    })

    setOpenedSeg(seg)
  }

  useLayoutEffect(() => {
    if (!pendingOpen) return
    if (openedSeg !== pendingOpen.seg) return

    const headerTitleEl = headerTitleRef.current
    const headerCountEl = headerCountRef.current
    if (!headerTitleEl || !headerCountEl) return

    // When opening, Mantine Collapse may not have applied layout yet on the first
    // frame, which can yield a (0x0) rect (and send the animation to the page corner).
    const startWhenReady = (attempt: number) => {
      const toTitleRect = headerTitleEl.getBoundingClientRect()
      const toCountRect = headerCountEl.getBoundingClientRect()

      const targetReady =
        (toTitleRect.width > 0 || toTitleRect.height > 0) && (toCountRect.width > 0 || toCountRect.height > 0)

      if (!targetReady) {
        if (attempt >= 3) {
          // Fallback: skip floating animation if targets never became measurable.
          setHideHeaderContent(false)
          setPendingOpen(null)
          return
        }

        requestAnimationFrame(() => startWhenReady(attempt + 1))
        return
      }

      // Adjust animation duration so it ends with the Collapse, even if we started late.
      const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()
      const startMs = toggleStartMsRef.current
      const elapsed = startMs ? Math.max(0, nowMs - startMs) : 0
      const remaining = Math.max(0, collapseDurationMs - elapsed)
      setFloatingDurationMs(remaining)

      setHideHeaderContent(true)
      setFloatingPhase('opening')
      setFloatingSeg(pendingOpen.seg)
      setFloatingTitleText(pendingOpen.label)
      setFloatingCountText(String(pendingOpen.count))

      setFloatingTitleToHeader(false)
      setFloatingCountToHeader(false)

      if (pendingOpen.fromTitle) setFloatingTitlePos(pendingOpen.fromTitle)
      if (pendingOpen.fromCount) setFloatingCountPos(pendingOpen.fromCount)

      requestAnimationFrame(() => {
        setFloatingTitleToHeader(true)
        setFloatingCountToHeader(true)
        setFloatingTitlePos(rectToPlain(toTitleRect))
        setFloatingCountPos(rectToPlain(toCountRect))
      })

      setPendingOpen(null)
    }

    startWhenReady(0)
  }, [openedSeg, pendingOpen])

  const uploadedCount = useMemo(() => {
    // Use comparison index size (unique IDs) rather than raw array length.
    return details.cfOnly.length + details.both.length + details.mismatch.length
  }, [details.both.length, details.cfOnly.length, details.mismatch.length])
  const apiCount = useMemo(() => {
    return details.kodeOnly.length + details.both.length + details.mismatch.length
  }, [details.both.length, details.kodeOnly.length, details.mismatch.length])

  const isPerfectMatch = counts.union > 0 && counts.onlyCf === 0 && counts.onlyKode === 0 && counts.metaMismatch === 0
  const isApiError = Boolean(apiError)
  const isNoKodeRows = !isApiError && uploadedCount > 0 && apiCount === 0

  const createCandidates = useMemo(() => {
    const createOp = resolve?.create
    if (!createOp) return [] as Array<CreateCandidate<UploadedRow>>
    return details.cfOnly
      .map((row) => {
        const identifier = normalizeIdentifier(uploadedId, readIdentifier(uploadedId, row, ctx))
        if (!identifier) return null
        const secondaryText = trimString(createOp.getSecondaryText?.(row, ctx) ?? '')
        return {
          key: `create:${identifier}`,
          identifier,
          secondaryText,
          uploadedRow: row,
        }
      })
      .filter(Boolean) as Array<CreateCandidate<UploadedRow>>
  }, [ctx, details.cfOnly, resolve, uploadedId])

  const updateCandidates = useMemo(() => {
    const updateOp = resolve?.update
    if (!updateOp) return [] as Array<UpdateCandidate<UploadedRow, ApiRow>>
    return details.mismatch
      .map((row) => {
        const apiMutationId = trimString(updateOp.getApiMutationId(row.apiRow, ctx))
        if (!apiMutationId) return null

        const secondaryText = trimString(
          updateOp.getSecondaryText?.({
            identifier: row.identifier,
            uploadedRow: row.uploadedRow,
            apiRow: row.apiRow,
            ctx,
          }) ??
            '',
        )

        return {
          key: `update:${row.identifier}:${apiMutationId}`,
          identifier: row.identifier,
          secondaryText,
          uploadedRow: row.uploadedRow,
          apiRow: row.apiRow,
          apiMutationId,
        }
      })
      .filter(Boolean) as Array<UpdateCandidate<UploadedRow, ApiRow>>
  }, [ctx, details.mismatch, resolve])

  const deleteCandidates = useMemo(() => {
    const deleteOp = resolve?.delete
    if (!deleteOp) return [] as Array<DeleteCandidate<ApiRow>>
    return details.kodeOnly
      .map((row) => {
        const identifierRaw = normalizeIdentifier(apiId, readIdentifier(apiId, row, ctx))
        const apiMutationId = trimString(deleteOp.getApiMutationId(row, ctx))
        if (!apiMutationId) return null
        const secondaryText = trimString(deleteOp.getSecondaryText?.(row, ctx) ?? '')

        // KODE rows can legitimately exist without an identifier; still include them
        // in analysis and allow delete operations to run.
        const identifier = identifierRaw || '(missing)'

        return {
          key: `delete:${identifier}:${apiMutationId}`,
          identifier,
          secondaryText,
          apiRow: row,
          apiMutationId,
        }
      })
      .filter(Boolean) as Array<DeleteCandidate<ApiRow>>
  }, [apiId, ctx, details.kodeOnly, resolve])

  const headingSize = headingLevel === 'section' ? 'lg' : 'md'

  const isSectionHeading = headingLevel === 'section'
  const stackGap = headingLevel === 'sub' ? 'xs' : 'sm'

  function renderHeadingRow(opts?: { leftAddon?: ReactNode; right?: ReactNode }) {
    const leftAddon = opts?.leftAddon ?? null
    const right = opts?.right ?? null

    const content = (
      <Group justify="space-between" align="center" wrap="nowrap">
        <Group gap={10} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
          <Text fw={900} size={headingSize} c={isSectionHeading ? 'white' : undefined}>
            {heading}
          </Text>

          {leftAddon}
        </Group>

        {right}
      </Group>
    )

    if (!isSectionHeading) return content

    return (
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
        <Box style={{ padding: 0 }}>
          <Group justify="space-between" align="stretch" wrap="nowrap" gap={0}>
            <Box style={{ padding: '10px 12px', minWidth: 0, flex: 1 }}>
              <Group justify="space-between" align="center" wrap="nowrap">
                <Group gap={10} align="center" wrap="nowrap" style={{ minWidth: 0 }}>
                  <Text fw={900} size={headingSize} c="white">
                    {heading}
                  </Text>

                  {leftAddon}
                </Group>
              </Group>
            </Box>

            {right}
          </Group>
        </Box>
      </Box>
    )
  }

  if (isApiError) {
    return (
      <Stack gap={stackGap}>
        {renderHeadingRow({
          leftAddon: (
            <Badge color="red" leftSection={<IconAlertTriangle size={14} />} variant="filled">
              API error
            </Badge>
          ),
        })}

        <Box style={{ padding: isSectionHeading ? 'var(--mantine-spacing-md)' : 0 }}>
          <Text size="sm" c="dimmed">
            {apiError}
          </Text>
        </Box>
      </Stack>
    )
  }

  if (counts.union === 0 && !isApiError) {
    return (
      <Stack gap={stackGap}>
        {renderHeadingRow()}

        <Box
          style={{
            padding: isSectionHeading ? 'var(--mantine-spacing-md)' : 0,
            minHeight: 96,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text size="sm" c="dimmed">
            {`No ${entityPluralLabel.toLowerCase()} found in uploaded data or API.`}
          </Text>
        </Box>
      </Stack>
    )
  }

  return (
    <Stack gap={stackGap}>
      {resolve && (
        <ResolveDifferencesModal
          opened={resolveOpened}
          onClose={() => setResolveOpened(false)}
          ctx={ctx}
          apiError={isApiError}
          resolve={resolve}
          createCandidates={createCandidates}
          updateCandidates={updateCandidates}
          deleteCandidates={deleteCandidates}
        />
      )}

      {renderHeadingRow({
        leftAddon: isNoKodeRows ? (
          <Badge color="red" leftSection={<IconAlertTriangle size={14} />} variant="filled">
            {`No ${entityPluralLabel.toLowerCase()} found on KODE OS`}
          </Badge>
        ) : null,
        right: isSectionHeading
          ? isPerfectMatch
            ? (
                <Box style={{ padding: '10px 12px', display: 'flex', alignItems: 'center' }}>
                  <Badge color="green" leftSection={<IconCheck size={14} />} variant="filled">
                    Perfect match
                  </Badge>
                </Box>
              )
            : resolve && !isApiError
              ? (
                  <Box style={{ alignSelf: 'stretch', display: 'flex' }}>
                    <button type="button" className="accent-header-action-button" onClick={() => setResolveOpened(true)}>
                      Resolve differences
                    </button>
                  </Box>
                )
              : null
          : isPerfectMatch
            ? (
                <Badge color="green" leftSection={<IconCheck size={14} />} variant="filled">
                  Perfect match
                </Badge>
              )
            : null,
      })}

      <Box style={{ padding: isSectionHeading ? 'var(--mantine-spacing-md)' : 0 }}>
        <Stack gap={0}>
          <CompareStackedBar
            counts={counts}
            entityPluralLabel={entityPluralLabel}
            onSegmentClick={handleSegmentClick}
            selectedSeg={openedSeg}
            hiddenSeg={returningSeg}
            onLabelElReady={(seg, el) => {
              labelElsRef.current[seg] = el
            }}
            onLabelPartsReady={(seg, parts) => {
              labelPartsRef.current[seg] = parts
            }}
          />

          <Collapse
            in={detailsOpen}
            transitionDuration={collapseDurationMs}
            transitionTimingFunction="cubic-bezier(0.2, 0, 0, 1)"
          >
            <Box className={`compare-inline-details${detailsOpen ? ' is-open' : ''}`}>
              <Group
                justify="space-between"
                align="center"
                wrap="nowrap"
                gap="sm"
                className="compare-inline-table-header"
                style={{
                  marginBottom: 0,
                  background: headerBg,
                  color: headerFg,
                }}
              >
                <Box
                  ref={(el) => {
                    headerAnchorRef.current = el
                  }}
                  style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}
                >
                  <Text
                    component="span"
                    ref={(el) => {
                      headerTitleRef.current = el
                    }}
                    fw={900}
                    size="sm"
                    style={{
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      visibility: hideHeaderContent ? 'hidden' : 'visible',
                      color: 'inherit',
                    }}
                  >
                    {selectedLabel}
                  </Text>
                  <Text
                    component="span"
                    ref={(el) => {
                      headerCountRef.current = el
                    }}
                    fw={900}
                    size="sm"
                    style={{ whiteSpace: 'nowrap', visibility: hideHeaderContent ? 'hidden' : 'visible', color: 'inherit' }}
                  >
                    {selectedCount}
                  </Text>
                </Box>

                <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    className="compare-inline-export-button"
                    aria-label="Export CSV"
                    onClick={() => handleExportCsv(openedSeg)}
                    style={{ color: headerFg, background: 'transparent', border: 0, cursor: 'pointer', padding: '4px 8px' }}
                  >
                    <IconDownload size={16} />
                  </button>

                  <button
                    type="button"
                    className="compare-inline-close-button"
                    aria-label="Close details"
                    onClick={requestClose}
                    style={{ color: headerFg }}
                  >
                    ×
                  </button>
                </Box>
              </Group>

              <CompareDetailsTable
                openedSeg={openedSeg}
                identifierLabel={identifierLabel ?? 'Code'}
                entityPluralLabel={entityPluralLabel}
                details={details}
                metadata={metadata}
                maxHeight={520}
              />
            </Box>
          </Collapse>
        </Stack>
      </Box>

      {floatingPhase && floatingSeg && floatingTitlePos && (
        <Box
          className={`compare-floating-title-chip${floatingTitleToHeader ? ' to-header' : ''}`}
          style={{
            left: floatingTitlePos.left,
            top: floatingTitlePos.top,
            width: floatingTitlePos.width,
            height: floatingTitlePos.height,
            ['--compare-float-ms' as any]: `${floatingDurationMs}ms`,
            ['--compare-header-fg' as any]: headerFg,
          }}
          onTransitionEnd={(e) => {
            if (e.propertyName !== 'left') return

            if (floatingPhase === 'opening') {
              clearFloating()
              setHideHeaderContent(false)
              return
            }

            // closing
            clearFloating()
            setHideHeaderContent(false)
            setReturningSeg(null)
          }}
        >
          {floatingTitleText}
        </Box>
      )}

      {floatingPhase && floatingSeg && floatingCountPos && (
        <Box
          className={`compare-floating-count-chip${floatingCountToHeader ? ' to-header' : ''}`}
          style={{
            left: floatingCountPos.left,
            top: floatingCountPos.top,
            width: floatingCountPos.width,
            height: floatingCountPos.height,
            ['--compare-float-ms' as any]: `${floatingDurationMs}ms`,
            ['--compare-header-fg' as any]: headerFg,
          }}
        >
          {floatingCountText}
        </Box>
      )}
    </Stack>
  )
}
