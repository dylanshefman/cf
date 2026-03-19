import { Box, Group, Text, Tooltip } from '@mantine/core'
import {
  IconArrowsLeftRight,
  IconAt,
  IconBuilding,
  IconLayersSelected,
  IconRulerMeasure,
  IconUser,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { EntityBadge } from '../badges/EntityBadge'
import { ValueBadge } from '../badges/ValueBadge'

function trimAny(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v.trim() : String(v).trim()
}

function isTenantLike(v: unknown): v is { _id?: unknown; id?: unknown; name?: unknown; type?: unknown } {
  if (!v || typeof v !== 'object') return false
  const anyV: any = v
  const hasId = Boolean(trimAny(anyV._id ?? anyV.id))
  const hasName = Boolean(trimAny(anyV.name))
  return hasId && hasName
}

function isSpaceLike(v: unknown): v is { _id?: unknown; id?: unknown; name?: unknown; category?: unknown } {
  if (!v || typeof v !== 'object') return false
  const anyV: any = v
  const hasId = Boolean(trimAny(anyV._id ?? anyV.id))
  const hasName = Boolean(trimAny(anyV.name))
  const hasCategory = Boolean(trimAny(anyV.category))
  return hasId && (hasName || hasCategory)
}

function renderTenantEntityBadge(tenant: unknown): ReactNode {
  if (!tenant || typeof tenant !== 'object') return null
  if (!isTenantLike(tenant)) return null

  const anyT: any = tenant
  return (
    <EntityBadge
      icon={<IconUser size={16} stroke={1.8} />}
      id={anyT._id ?? anyT.id}
      name={anyT.name}
      meta={anyT.type}
      tooltip={trimAny(anyT._id ?? anyT.id) || trimAny(anyT.name)}
    />
  )
}

function renderSpaceEntityBadge(space: unknown): ReactNode {
  if (!space || typeof space !== 'object') return null
  if (!isSpaceLike(space)) return null

  const anyS: any = space
  return (
    <EntityBadge
      icon={<IconLayersSelected size={16} stroke={1.8} />}
      id={anyS._id ?? anyS.id}
      name={anyS.name}
      meta={anyS.category}
      tooltip={trimAny(anyS._id ?? anyS.id) || trimAny(anyS.name) || trimAny(anyS.category)}
    />
  )
}

export function renderTenantSpaceAssignmentBadges(args: {
  tenant: unknown
  space: unknown
  size?: number
}): ReactNode {
  const { tenant, space, size = 16 } = args
  const tenantNode = renderTenantEntityBadge(tenant)
  const spaceNode = renderSpaceEntityBadge(space)

  if (!tenantNode && !spaceNode) return ''

  return (
    <Group gap={8} wrap="nowrap" align="center" style={{ maxWidth: '100%' }}>
      <Box style={{ flex: '0 0 auto', minWidth: 0 }}>{tenantNode || <Text size="sm">—</Text>}</Box>
      <Box style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>
        <IconArrowsLeftRight size={size} stroke={1.8} style={{ color: 'var(--mantine-color-dimmed)' }} />
      </Box>
      <Box style={{ flex: '0 0 auto', minWidth: 0 }}>{spaceNode || <Text size="sm">—</Text>}</Box>
    </Group>
  )
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function isHex24(value: string): boolean {
  return /^[a-fA-F0-9]{24}$/.test(value)
}

function toDisplayAreaUnit(unit: string): string {
  const u = unit.trim().toLowerCase().replace('^2', '2').replace('²', '2')
  if (u === 'ft2') return 'ft²'
  if (u === 'm2') return 'm²'
  return unit.trim()
}

function parseKodeDate(input: string): Date | null {
  // KODE commonly returns: 2026-02-26T12:17:22+0000 (no colon in offset)
  const m = input.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})([+-]\d{2})(\d{2})$/)
  if (!m) return null
  const iso = `${m[1]}T${m[2]}${m[3]}:${m[4]}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function formatTwoLineDate(d: Date): string {
  // Keep deterministic / timezone-agnostic: show UTC.
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const month = months[d.getUTCMonth()] ?? '???'
  const day = d.getUTCDate()
  const year = d.getUTCFullYear()

  const hours24 = d.getUTCHours()
  const minutes = pad2(d.getUTCMinutes())
  const ampm = hours24 >= 12 ? 'pm' : 'am'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  const time = `${hours12}:${minutes}${ampm}`

  return `${month} ${day} ${year}\n${time}`
}

export function renderCompareRawJsonCellValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return ''

  const indent = (n: number): string => '  '.repeat(Math.max(0, n))

  const renderInlineJson = (v: unknown, depth: number): ReactNode => {
    if (v === null) return 'null'
    if (v === undefined) return 'null'
    if (typeof v === 'string') return JSON.stringify(v)
    if (typeof v === 'number' || typeof v === 'boolean') return String(v)

    // Special case: tenant badge.
    if (isTenantLike(v)) return renderTenantEntityBadge(v)

    if (Array.isArray(v)) {
      // Special case: spaces array badge list.
      const spaceBadges = v.filter(isSpaceLike).map((s, idx) => <span key={idx}>{renderSpaceEntityBadge(s)}</span>)
      if (spaceBadges.length) {
        return (
          <>
            [
            {'\n'}
            {indent(depth + 1)}
            <Group gap={6} wrap="wrap" style={{ display: 'inline-flex', verticalAlign: 'middle' }}>
              {spaceBadges}
            </Group>
            {'\n'}
            {indent(depth)}]
          </>
        )
      }

      if (v.length === 0) return '[]'
      return (
        <>
          [
          {'\n'}
          {v.map((item, idx) => (
            <Box component="span" key={idx}>
              {indent(depth + 1)}
              {renderInlineJson(item, depth + 1)}
              {idx < v.length - 1 ? ',' : ''}
              {'\n'}
            </Box>
          ))}
          {indent(depth)}]
        </>
      )
    }

    if (v && typeof v === 'object') {
      const obj: Record<string, unknown> = v as any
      const keys = Object.keys(obj)
      if (keys.length === 0) return '{}'

      return (
        <>
          {'{'}
          {'\n'}
          {keys.map((k, idx) => {
            const isLast = idx === keys.length - 1
            const rawVal = (obj as any)[k]
            const rendered = k === 'tenant' ? renderInlineJson(rawVal, depth + 1) : k === 'spaces' ? renderInlineJson(rawVal, depth + 1) : renderInlineJson(rawVal, depth + 1)

            return (
              <Box component="span" key={k}>
                {indent(depth + 1)}
                {JSON.stringify(k)}: {rendered}
                {isLast ? '' : ','}
                {'\n'}
              </Box>
            )
          })}
          {indent(depth)}
          {'}'}
        </>
      )
    }

    return JSON.stringify(v)
  }

  return (
    <Box
      component="pre"
      style={{
        margin: 0,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      }}
    >
      {renderInlineJson(value, 0)}
    </Box>
  )
}

export function renderCompareCellValue(value: unknown): ReactNode {
  if (value === null || value === undefined) return ''

  if (typeof value === 'string') {
    const s = value.trim()
    if (!s) return ''

    const d = parseKodeDate(s)
    if (d) {
      const concise = formatTwoLineDate(d)
      return (
        <Tooltip label={s} withArrow>
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
            {concise}
          </Text>
        </Tooltip>
      )
    }

    if (isHex24(s)) {
      const short = `${s.slice(0, 3)}…${s.slice(-1)}`
      return (
        <ValueBadge icon={<IconAt size={14} stroke={1.8} />} lines={[short]} tooltip={s} />
      )
    }

    const areaMatch = s.match(/^(-?\d+(?:\.\d+)?)\s*\|\s*([a-zA-Z0-9²^]+)$/)
    if (areaMatch) {
      const valuePart = areaMatch[1] ?? ''
      const unitPart = areaMatch[2] ?? ''
      const unitDisplay = toDisplayAreaUnit(unitPart)
      return (
        <ValueBadge
          icon={<IconRulerMeasure size={14} stroke={1.8} />}
          lines={[valuePart, unitDisplay]}
          tooltip={s}
        />
      )
    }

    return s
  }

  if (isPlainObject(value)) {
    const maybeBuildingId = typeof value._id === 'string' ? value._id.trim() : ''
    const maybeBuildingName = typeof value.name === 'string' ? value.name.trim() : ''

    if (maybeBuildingId && maybeBuildingName) {
      return (
        <EntityBadge
          icon={<IconBuilding size={16} stroke={1.8} />}
          id={maybeBuildingId}
          name={maybeBuildingName}
          meta={''}
          tooltip={maybeBuildingId}
        />
      )
    }

    const maybeCategory = typeof (value as any)?.category === 'string' ? String((value as any).category).trim() : ''
    const maybeLevelId = typeof (value as any)?.id === 'string' ? String((value as any).id).trim() : ''
    const maybeLevelName = typeof (value as any)?.name === 'string' ? String((value as any).name).trim() : ''
    if (maybeCategory === 'Level' && maybeLevelName) {
      return (
        <EntityBadge
          icon={<IconLayersSelected size={16} stroke={1.8} />}
          id={maybeLevelId}
          name={maybeLevelName}
          meta={'Level'}
          tooltip={maybeLevelId || JSON.stringify(value)}
        />
      )
    }

    const maybeAreaValue = (value as any)?.value
    const unitRaw = (value as any)?.unit
    const maybeAreaSymbol =
      typeof unitRaw === 'string'
        ? unitRaw.trim()
        : isPlainObject(unitRaw) && typeof (unitRaw as any)?.symbol === 'string'
          ? String((unitRaw as any).symbol).trim()
          : ''

    const isAreaValue = typeof maybeAreaValue === 'number' || (typeof maybeAreaValue === 'string' && maybeAreaValue.trim())
    if (isAreaValue && maybeAreaSymbol) {
      return (
        <ValueBadge
          icon={<IconRulerMeasure size={14} stroke={1.8} />}
          lines={[String(maybeAreaValue).trim(), maybeAreaSymbol]}
          tooltip={JSON.stringify(value)}
        />
      )
    }
  }

  // Fallback for arrays/objects/numbers/booleans.
  try {
    if (typeof value === 'object') return renderCompareRawJsonCellValue(value)
  } catch {
    // ignore
  }

  return String(value)
}
