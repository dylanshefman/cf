import { Box, Text, Tooltip } from '@mantine/core'
import * as d3 from 'd3'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CF_GRAPH_COLOR, KODE_GRAPH_COLOR } from '../../utils/graphColors'
import type { CompareCounts, CompareSegmentKey } from './compareTypes'

const BAR_H = 44
const BAR_Y = 14
const LABEL_GAP = 20
const LABEL_LINE_H = 14
const CHART_H = BAR_Y + BAR_H + LABEL_GAP + LABEL_LINE_H * 2 + 10

const CHART_PAD_X = 8

type SegmentLayout = {
  key: CompareSegmentKey
  label: string
  count: number
  x: number
  w: number
  fill: string
}

function segmentPath(opts: {
  x: number
  y: number
  w: number
  h: number
  r: number
  roundLeft: boolean
  roundRight: boolean
}): string {
  const { x, y, w, h, r, roundLeft, roundRight } = opts
  if (w <= 0 || h <= 0) return `M${x},${y}h0v${h}h0Z`

  const rr = Math.max(0, Math.min(r, h / 2, w / 2))
  const leftR = roundLeft ? rr : 0
  const rightR = roundRight ? rr : 0

  const x0 = x
  const x1 = x + w
  const y0 = y
  const y1 = y + h

  // Clockwise path with optional rounding on the outer ends only.
  return [
    `M${x0 + leftR},${y0}`,
    `H${x1 - rightR}`,
    rightR ? `A${rightR},${rightR} 0 0 1 ${x1},${y0 + rightR}` : '',
    `V${y1 - rightR}`,
    rightR ? `A${rightR},${rightR} 0 0 1 ${x1 - rightR},${y1}` : '',
    `H${x0 + leftR}`,
    leftR ? `A${leftR},${leftR} 0 0 1 ${x0},${y1 - leftR}` : '',
    `V${y0 + leftR}`,
    leftR ? `A${leftR},${leftR} 0 0 1 ${x0 + leftR},${y0}` : '',
    'Z',
  ]
    .filter(Boolean)
    .join(' ')
}

export type CompareStackedBarProps = {
  counts: CompareCounts
  entityPluralLabel: string
  onSegmentClick: (seg: CompareSegmentKey) => void
  selectedSeg?: CompareSegmentKey | null
  hiddenSeg?: CompareSegmentKey | null
  onLabelElReady?: (seg: CompareSegmentKey, el: HTMLDivElement | null) => void
  onLabelPartsReady?: (
    seg: CompareSegmentKey,
    parts: { container: HTMLDivElement | null; title: HTMLSpanElement | null; count: HTMLSpanElement | null },
  ) => void
}

export function CompareStackedBar({
  counts,
  entityPluralLabel,
  onSegmentClick,
  selectedSeg = null,
  hiddenSeg = null,
  onLabelElReady,
  onLabelPartsReady,
}: CompareStackedBarProps) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [hoveredSeg, setHoveredSeg] = useState<CompareSegmentKey | null>(null)

  const labelY = BAR_Y + BAR_H + LABEL_GAP

  const clipIdRaw = useId()
  const clipId = useMemo(() => `compare-clip-${clipIdRaw.replace(/[^a-zA-Z0-9_-]/g, '')}`, [clipIdRaw])

  const segmentLayouts = useMemo(() => {
    const width = containerWidth
    if (!width) return [] as SegmentLayout[]

    const inset = CHART_PAD_X
    const innerW = Math.max(0, width - inset * 2)
    const union = counts.union || 1
    const scale = d3.scaleLinear().domain([0, union]).range([0, innerW])

    const onlyCfW = scale(counts.onlyCf)
    const bothW = scale(counts.both)
    const mismatchW = scale(counts.metaMismatch)
    const onlyKodeW = scale(counts.onlyKode)

    const overlapFill = 'var(--mantine-color-green-filled)'
    const mismatchFill = 'var(--mantine-color-yellow-filled)'

    return [
      {
        key: 'cf' as const,
        label: 'CF only',
        count: counts.onlyCf,
        x: inset,
        w: onlyCfW,
        fill: CF_GRAPH_COLOR,
      },
      {
        key: 'both' as const,
        label: 'Both',
        count: counts.both,
        x: inset + onlyCfW,
        w: bothW,
        fill: overlapFill,
      },
      {
        key: 'mismatch' as const,
        label: 'Metadata mismatch',
        count: counts.metaMismatch,
        x: inset + onlyCfW + bothW,
        w: mismatchW,
        fill: mismatchFill,
      },
      {
        key: 'kode' as const,
        label: 'KODE only',
        count: counts.onlyKode,
        x: inset + onlyCfW + bothW + mismatchW,
        w: onlyKodeW,
        fill: KODE_GRAPH_COLOR,
      },
    ].filter((s) => s.count > 0)
  }, [containerWidth, counts.both, counts.metaMismatch, counts.onlyCf, counts.onlyKode, counts.union])

  useEffect(() => {
    if (!containerEl) return

    const target = containerEl.parentElement ?? containerEl
    let rafId = 0

    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0
      const nextWidth = Math.max(0, Math.floor(w))

      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        setContainerWidth((prev) => {
          if (prev === nextWidth) return prev
          return nextWidth
        })
      })
    })

    ro.observe(target)

    return () => {
      cancelAnimationFrame(rafId)
      ro.disconnect()
    }
  }, [containerEl])

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    // Prevent unnecessary redraws that interrupt animations
    if (svgEl.dataset.width === String(containerWidth)) return
    svgEl.dataset.width = String(containerWidth)

    const root = d3.select(svgEl)

    // Ensure we never keep stale SVG labels around (e.g. after hot reload).
    root.selectAll('*').remove()

    const width = containerWidth
    if (!width) return

    const inset = CHART_PAD_X
    const innerW = Math.max(0, width - inset * 2)
    const union = counts.union || 1

    const height = CHART_H
    const barH = BAR_H
    const barY = BAR_Y

    const scale = d3.scaleLinear().domain([0, union]).range([0, innerW])

    const onlyCfW = scale(counts.onlyCf)
    const bothW = scale(counts.both)
    const mismatchW = scale(counts.metaMismatch)
    const onlyKodeW = scale(counts.onlyKode)

    const overlapFill = 'var(--mantine-color-green-filled)'
    const mismatchFill = 'var(--mantine-color-yellow-filled)'

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const durationMs = prefersReducedMotion ? 0 : 650
    const easeFn = d3.easeCubicOut

    root
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('role', 'img')

    const segmentRx = 10

    const defs = root.append('defs')
    const shadowFilterId = `${clipId}-shadow`

    defs
      .append('filter')
      .attr('id', shadowFilterId)
      .attr('x', '-20%')
      .attr('y', '-20%')
      .attr('width', '140%')
      .attr('height', '160%')
      .append('feDropShadow')
      .attr('dx', 0)
      .attr('dy', 4)
      .attr('stdDeviation', 4)
      .attr('flood-color', 'rgba(0, 0, 0, 0.35)')
      .attr('flood-opacity', 1)

    const shadowG = root.append('g').attr('data-role', 'shadow')
    const barG = root.append('g').attr('data-role', 'bar')

    const segments = [
      {
        key: 'cf' as const,
        label: 'CF only',
        count: counts.onlyCf,
        x: inset,
        w: onlyCfW,
        fill: CF_GRAPH_COLOR,
      },
      {
        key: 'both' as const,
        label: 'Both',
        count: counts.both,
        x: inset + onlyCfW,
        w: bothW,
        fill: overlapFill,
      },
      {
        key: 'mismatch' as const,
        label: 'Metadata mismatch',
        count: counts.metaMismatch,
        x: inset + onlyCfW + bothW,
        w: mismatchW,
        fill: mismatchFill,
      },
      {
        key: 'kode' as const,
        label: 'KODE only',
        count: counts.onlyKode,
        x: inset + onlyCfW + bothW + mismatchW,
        w: onlyKodeW,
        fill: KODE_GRAPH_COLOR,
      },
    ].filter((s) => s.count > 0)

    const firstKey = segments[0]?.key
    const lastKey = segments[segments.length - 1]?.key

    for (const seg of segments) {
      const roundLeft = seg.key === firstKey
      const roundRight = seg.key === lastKey

      const shadowPath = shadowG
        .append('path')
        .attr(
          'd',
          segmentPath({
            x: seg.x,
            y: barY,
            w: durationMs ? 0 : seg.w,
            h: barH,
            r: segmentRx,
            roundLeft,
            roundRight,
          }),
        )
        .attr('fill', 'rgba(0,0,0,0.22)')
        .attr('opacity', 0)
        .attr('filter', `url(#${shadowFilterId})`)
        .attr('data-seg', seg.key)
        .attr('data-kind', 'shadow')

      const mainPath = barG
        .append('path')
        .attr(
          'd',
          segmentPath({
            x: seg.x,
            y: barY,
            w: durationMs ? 0 : seg.w,
            h: barH,
            r: segmentRx,
            roundLeft,
            roundRight,
          }),
        )
        .attr('fill', seg.fill)
        .attr('data-seg', seg.key)
        .attr('data-kind', 'main')

      if (durationMs) {
        const tweenD = (targetW: number) => {
          const interp = d3.interpolateNumber(0, targetW)
          return (t: number) =>
            segmentPath({
              x: seg.x,
              y: barY,
              w: interp(t),
              h: barH,
              r: segmentRx,
              roundLeft,
              roundRight,
            })
        }

        shadowPath.transition().duration(durationMs).ease(easeFn).attrTween('d', () => tweenD(seg.w))

        mainPath.transition().duration(durationMs).ease(easeFn).attrTween('d', () => tweenD(seg.w))
      }
    }
  }, [
    clipId,
    containerWidth,
    counts.both,
    counts.metaMismatch,
    counts.onlyCf,
    counts.onlyKode,
    counts.union,
  ])

  useEffect(() => {
    const svgEl = svgRef.current
    if (!svgEl) return

    const root = d3.select(svgEl)

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const durationMs = prefersReducedMotion ? 0 : 280
    const easeFn = d3.easeCubicOut

    const levitatedSeg = selectedSeg ?? hoveredSeg
    const hasSelection = Boolean(selectedSeg)
    const liftY = 8

    const mainPaths = root.selectAll('path[data-kind="main"][data-seg]')
    mainPaths
      .interrupt()
      .transition()
      .duration(durationMs)
      .ease(easeFn)
      .attr('transform', function () {
        const key = String(d3.select(this).attr('data-seg') ?? '') as CompareSegmentKey
        return levitatedSeg && key === levitatedSeg ? `translate(0, ${-liftY})` : 'translate(0, 0)'
      })
      .attr('opacity', function () {
        const key = String(d3.select(this).attr('data-seg') ?? '') as CompareSegmentKey
        if (!hasSelection) return 1
        return selectedSeg && key === selectedSeg ? 1 : 0.28
      })

    const shadowPaths = root.selectAll('path[data-kind="shadow"][data-seg]')
    shadowPaths
      .interrupt()
      .transition()
      .duration(durationMs)
      .ease(easeFn)
      .attr('opacity', function () {
        const key = String(d3.select(this).attr('data-seg') ?? '') as CompareSegmentKey
        if (!levitatedSeg) return 0
        return key === levitatedSeg ? 1 : 0
      })
  }, [hoveredSeg, selectedSeg])

  return (
    <Box ref={setContainerEl} style={{ width: '100%', position: 'relative' }}>
      <Box component="svg" ref={svgRef} style={{ display: 'block' }} />

      {segmentLayouts.map((seg) => {
        const cx = seg.x + seg.w / 2
        const tooltipLabel =
          seg.key === 'cf'
            ? `${entityPluralLabel} present in CF upload but not found in KODE OS. Click to view details.`
            : seg.key === 'kode'
              ? `${entityPluralLabel} present in KODE OS but not found in CF upload. Click to view details.`
              : seg.key === 'mismatch'
                ? `${entityPluralLabel} IDs match, but one or more metadata fields differ. Click to view details.`
                : `${entityPluralLabel} IDs match and all metadata fields match. Click to view details.`

        const isHovered = hoveredSeg === seg.key
        const isSelected = selectedSeg === seg.key
        const isHidden = hiddenSeg === seg.key
        const hasSelection = selectedSeg !== null
        const isWashedOut = hasSelection && !isSelected
        const handleEnter = () => setHoveredSeg(seg.key)
        const handleLeave = () => setHoveredSeg((prev) => (prev === seg.key ? null : prev))
        const handleClick = () => onSegmentClick(seg.key)

        return (
          <Box key={seg.key}>
            <Tooltip label={tooltipLabel} withArrow position="top">
              <Box
                role="button"
                tabIndex={0}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                onClick={handleClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleClick()
                }}
                style={{
                  position: 'absolute',
                  left: seg.x,
                  top: BAR_Y,
                  width: seg.w,
                  height: BAR_H,
                  cursor: 'pointer',
                  outline: 'none',
                  background: 'transparent',
                }}
              />
            </Tooltip>

            <Tooltip label={tooltipLabel} withArrow position="top">
              <Box
                ref={(el) => {
                  if (typeof onLabelElReady === 'function') onLabelElReady(seg.key, el)

                  if (typeof onLabelPartsReady === 'function') {
                    const titleEl = el?.querySelector('[data-role="compare-label-title"]') as HTMLSpanElement | null
                    const countEl = el?.querySelector('[data-role="compare-label-count"]') as HTMLSpanElement | null
                    onLabelPartsReady(seg.key, { container: el, title: titleEl, count: countEl })
                  }
                }}
                role="button"
                tabIndex={0}
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
                onClick={handleClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') handleClick()
                }}
                style={{
                  position: 'absolute',
                  left: cx,
                  top: labelY - 10,
                  transform: `translate(-50%, ${isSelected ? 6 : 0}px)`,
                  cursor: 'pointer',
                  outline: 'none',
                  background: isHovered ? 'var(--mantine-color-gray-1)' : 'transparent',
                  borderRadius: 10,
                  padding: '4px 10px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  userSelect: 'none',
                  opacity: isSelected || isHidden ? 0 : isWashedOut ? 0.42 : 1,
                  pointerEvents: isSelected || isHidden ? 'none' : 'auto',
                  transition: 'opacity 280ms cubic-bezier(0.2, 0, 0, 1), transform 280ms cubic-bezier(0.2, 0, 0, 1)',
                }}
              >
                <Text
                  component="span"
                  data-role="compare-label-title"
                  size="xs"
                  fw={700}
                  c="dimmed"
                  style={{ lineHeight: 1.1, textAlign: 'center', display: 'block' }}
                >
                  {seg.label}
                </Text>
                <Text
                  component="span"
                  data-role="compare-label-count"
                  size="sm"
                  fw={900}
                  c="dark"
                  style={{ lineHeight: 1.1, textAlign: 'center', display: 'block' }}
                >
                  {seg.count}
                </Text>
              </Box>
            </Tooltip>
          </Box>
        )
      })}
    </Box>
  )
}
