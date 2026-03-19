import { Badge, Box, Stack, Text, Tooltip } from '@mantine/core'
import type { ReactNode } from 'react'

const BADGE_SHADOW = 'var(--mantine-shadow-xs)'

function trimAny(v: unknown): string {
  if (v === null || v === undefined) return ''
  return typeof v === 'string' ? v.trim() : String(v).trim()
}

function shortId(id: unknown): string {
  const s = trimAny(id)
  if (!s) return ''
  if (s.length <= 8) return s
  return `${s.slice(0, 4)}…${s.slice(-2)}`
}

function estimateMinWidthPx(args: { idLine: string; nameLine: string; metaLine: string }): number | undefined {
  const { idLine, nameLine, metaLine } = args
  const lens = [idLine.length, nameLine.length, metaLine.length]
  const maxLen = Math.max(...lens)
  if (maxLen <= 0) return undefined

  // Very rough width estimate; used only as a *floor* to prevent the table from
  // collapsing the badge to just an icon.
  const iconAndPadding = 56
  const pxPerChar = 6.2
  const estimated = Math.round(iconAndPadding + maxLen * pxPerChar)

  // Keep this minimal; we don't want to arbitrarily widen when content is short.
  return Math.min(160, Math.max(96, estimated))
}

export type EntityBadgeProps = {
  icon: ReactNode
  id?: unknown
  name?: unknown
  meta?: unknown
  tooltip?: string
  minWidthMode?: 'auto' | 'none' | { px: number }
}

export function EntityBadge({ icon, id, name, meta, tooltip, minWidthMode = 'auto' }: EntityBadgeProps) {
  const idRaw = trimAny(id)
  const nameRaw = trimAny(name)
  const metaRaw = trimAny(meta)

  const idLine = idRaw ? `@${shortId(idRaw)}` : ''
  const nameLine = nameRaw || '(no name)'
  const metaLine = metaRaw

  const minWidthPx =
    minWidthMode === 'none'
      ? undefined
      : typeof minWidthMode === 'object'
        ? minWidthMode.px
        : estimateMinWidthPx({ idLine, nameLine, metaLine })

  const inner = (
    <Badge
      variant="light"
      radius="sm"
      styles={{
        root: {
          height: 'auto',
          maxWidth: '100%',
          minWidth: minWidthPx,
          paddingTop: 6,
          paddingBottom: 6,
          boxShadow: BADGE_SHADOW,
        },
        label: {
          display: 'block',
          width: '100%',
          lineHeight: 1.15,
        },
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', columnGap: 6, width: '100%' }}>
        <Box style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>{icon}</Box>
        <Stack gap={2} style={{ flex: '1 1 auto', minWidth: 0, alignItems: 'flex-start' }}>
          {idLine ? (
            <Text
              size="xs"
              fw={400}
              c="dimmed"
              style={{ lineHeight: 1.15, fontSize: 11, maxWidth: '100%' }}
              truncate
            >
              {idLine}
            </Text>
          ) : null}

          <Text size="xs" fw={800} style={{ lineHeight: 1.2, maxWidth: '100%' }} truncate>
            {nameLine}
          </Text>

          {metaLine ? (
            <Text
              size="xs"
              fw={400}
              style={{ lineHeight: 1.15, color: 'var(--mantine-color-blue-7)', maxWidth: '100%' }}
              truncate
            >
              {metaLine}
            </Text>
          ) : null}
        </Stack>
      </Box>
    </Badge>
  )

  const tip = trimAny(tooltip) || idRaw || nameRaw || metaRaw
  if (!tip) return inner

  return (
    <Tooltip label={tip} withArrow>
      <Box style={{ display: 'inline-flex', maxWidth: '100%' }}>{inner}</Box>
    </Tooltip>
  )
}
