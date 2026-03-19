import { Badge, Box, Stack, Text, Tooltip } from '@mantine/core'
import type { ReactNode } from 'react'

const BADGE_SHADOW = 'var(--mantine-shadow-xs)'

function estimateMinWidthPx(args: { lines: string[] }): number | undefined {
  const maxLen = Math.max(0, ...args.lines.map((l) => l.length))
  if (maxLen <= 0) return undefined

  const iconAndPadding = 44
  const pxPerChar = 6.0
  const estimated = Math.round(iconAndPadding + maxLen * pxPerChar)

  // Keep minimal: prevent total collapse, but avoid arbitrary widening.
  return Math.min(140, Math.max(84, estimated))
}

export type ValueBadgeProps = {
  icon?: ReactNode
  lines: string[]
  tooltip?: string
  minWidthMode?: 'auto' | 'none' | { px: number }
}

export function ValueBadge({ icon, lines, tooltip, minWidthMode = 'auto' }: ValueBadgeProps) {
  const cleanLines = (lines || []).map((l) => String(l ?? '')).filter((l) => l.trim().length > 0)
  if (cleanLines.length === 0) return null

  const minWidthPx =
    minWidthMode === 'none'
      ? undefined
      : typeof minWidthMode === 'object'
        ? minWidthMode.px
        : estimateMinWidthPx({ lines: cleanLines })

  const inner = (
    <Badge
      variant="light"
      color="gray"
      radius="sm"
      styles={{
        root: {
          display: 'inline-flex',
          height: 'auto',
          maxWidth: '100%',
          minWidth: minWidthPx,
          alignItems: 'center',
          paddingTop: 6,
          paddingBottom: 6,
          overflow: 'visible',
          boxShadow: BADGE_SHADOW,
        },
        label: {
          display: 'inline-flex',
          whiteSpace: 'normal',
          lineHeight: 1.2,
          overflow: 'visible',
        },
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', columnGap: 4, maxWidth: '100%' }}>
        {icon ? (
          <Box style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center' }}>{icon}</Box>
        ) : null}

        {cleanLines.length === 1 ? (
          <Text size="xs" fw={800} style={{ lineHeight: 1.1, maxWidth: '100%' }} truncate>
            {cleanLines[0]}
          </Text>
        ) : (
          <Stack gap={2} style={{ alignItems: 'flex-start', minWidth: 0 }}>
            {cleanLines.map((line, idx) => (
              <Text
                key={idx}
                size="xs"
                fw={800}
                style={{ lineHeight: 1.1, maxWidth: '100%' }}
                truncate
              >
                {line}
              </Text>
            ))}
          </Stack>
        )}
      </Box>
    </Badge>
  )

  const tip = (tooltip ?? '').trim()
  if (!tip) return inner

  return (
    <Tooltip label={tip} withArrow>
      <Box style={{ display: 'inline-flex', maxWidth: '100%' }}>{inner}</Box>
    </Tooltip>
  )
}
