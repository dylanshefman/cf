import {
  Box,
  Group,
  ScrollArea,
  Stack,
  Text,
  Title,
  UnstyledButton,
  Paper,
} from '@mantine/core'
import type { ReactNode, RefObject } from 'react'
import { useRef } from 'react'
import { FcDataSheet, FcEngineering } from 'react-icons/fc'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { DataSidebar } from '../sidebar/DataSidebar'
import { AuditSidebar } from '../sidebar/AuditSidebar.tsx'
import { SupportedOperations } from '../sidebar/SupportedOperations'
import { ComboChartIcon } from '../icons/ComboChartIcon'

const SIDEBAR_WIDTH = 320
const OUTER_PAD = 'var(--mantine-spacing-lg)'
const NAV_ROW_HEIGHT_PX = 76
const HEADER_ROW_GAP = 'var(--mantine-spacing-md)'
const CONTENT_PAD = 'var(--mantine-spacing-xl)'

export type LayoutOutletContext = {
  headerRightRef: RefObject<HTMLDivElement | null>
}

function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '').trim()
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned
  const num = Number.parseInt(full, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function darkenHex(hex: string, amount: number): string {
  const cleaned = hex.replace('#', '').trim()
  const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned
  const num = Number.parseInt(full, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255

  const f = Math.max(0, Math.min(1, 1 - amount))
  const rr = Math.round(r * f)
  const gg = Math.round(g * f)
  const bb = Math.round(b * f)
  return `rgb(${rr}, ${gg}, ${bb})`
}

function accentGradient(hex: string): string {
  return `linear-gradient(180deg, ${hexToRgba(hex, 1)} 0%, ${darkenHex(hex, 0.12)} 100%)`
}

function accentLightGradient(hex: string): string {
  return `linear-gradient(180deg, ${hexToRgba(hex, 0.18)} 0%, ${hexToRgba(hex, 0.1)} 100%)`
}

const ACCENT_DATA = '#00BCD4'
const ACCENT_AUDIT = '#3F51B5'
const ACCENT_OPS = '#FF9800'

type NavItem = {
  label: string
  path: string
  icon: ReactNode
  active: boolean
  accent: string
  accentLightBg: string
}

function TopNavButtons({ items }: { items: NavItem[] }) {
  const navigate = useNavigate()

  return (
    <Group gap="sm" wrap="nowrap" px="lg" pt="lg">
      {items.map((item) => (
        <UnstyledButton
          key={item.path}
          onClick={() => navigate(item.path)}
          style={{
            flex: 1,
            height: 76,
            borderRadius: 'var(--mantine-radius-md)',
            background: item.active ? item.accentLightBg : 'var(--mantine-color-white)',
            boxShadow: 'var(--mantine-shadow-sm)',
            border: item.active ? `2px solid ${item.accent}` : '1px solid var(--mantine-color-gray-3)',
          }}
        >
          <Stack gap={4} align="center" justify="center" h="100%">
            <Box style={{ fontSize: 26, lineHeight: 1 }}>{item.icon}</Box>

            <Text size="xs" fw={800} style={{ color: item.active ? item.accent : 'var(--mantine-color-dimmed)' }}>
              {item.label}
            </Text>
          </Stack>
        </UnstyledButton>
      ))}
    </Group>
  )
}

function SidebarContent() {
  const location = useLocation()

  if (location.pathname.startsWith('/audit')) return <AuditSidebar />
  if (location.pathname.startsWith('/ops')) return null
  return <DataSidebar />
}

function SidebarBottom() {
  const location = useLocation()

  if (location.pathname.startsWith('/data')) return <SupportedOperations />
  return null
}

export function EnforcedLayout() {
  const location = useLocation()
  const headerRightRef = useRef<HTMLDivElement | null>(null)

  const pageAccent = location.pathname.startsWith('/ops')
    ? ACCENT_OPS
    : location.pathname.startsWith('/audit')
      ? ACCENT_AUDIT
      : ACCENT_DATA

  const pageAccentLight = hexToRgba(pageAccent, 0.14)
  const pageAccentBg = accentGradient(pageAccent)
  const pageAccentLightBg = accentLightGradient(pageAccent)

  const navItems: NavItem[] = [
    {
      label: 'Data',
      path: '/data',
      icon: <FcDataSheet />,
      active: location.pathname.startsWith('/data'),
      accent: ACCENT_DATA,
      accentLightBg: accentLightGradient(ACCENT_DATA),
    },
    {
      label: 'Audit',
      path: '/audit',
      icon: <ComboChartIcon />,
      active: location.pathname.startsWith('/audit'),
      accent: ACCENT_AUDIT,
      accentLightBg: accentLightGradient(ACCENT_AUDIT),
    },
    {
      label: 'Ops',
      path: '/ops',
      icon: <FcEngineering />,
      active: location.pathname.startsWith('/ops'),
      accent: ACCENT_OPS,
      accentLightBg: accentLightGradient(ACCENT_OPS),
    },
  ]

  const pageTitle = location.pathname.startsWith('/ops')
    ? 'Operations'
    : location.pathname.startsWith('/audit')
      ? 'Audit'
      : 'Data'

  return (
    <Box
      style={{
        background: 'var(--mantine-color-gray-1)',
        minHeight: '100dvh',
        ['--page-accent' as any]: pageAccent,
        ['--page-accent-light' as any]: pageAccentLight,
        ['--page-accent-bg' as any]: pageAccentBg,
        ['--page-accent-light-bg' as any]: pageAccentLightBg,
      }}
    >
      <Box
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: SIDEBAR_WIDTH,
          background: 'var(--mantine-color-gray-1)',
          zIndex: 10,
        }}
      >
        <Stack gap="md" style={{ height: '100%' }}>
          <TopNavButtons items={navItems} />

          <ScrollArea type="auto" style={{ flex: 1 }}>
            <Box px="lg" pb="lg">
              <SidebarContent />
            </Box>
          </ScrollArea>

          <Box px="lg" pb="lg">
            <SidebarBottom />
          </Box>
        </Stack>
      </Box>

      <Box
        style={{
          marginLeft: SIDEBAR_WIDTH,
          paddingTop: OUTER_PAD,
          paddingRight: OUTER_PAD,
          paddingBottom: OUTER_PAD,
          paddingLeft: 0,
          minHeight: '100dvh',
        }}
      >
        <Box
          style={{
            height: NAV_ROW_HEIGHT_PX,
            marginBottom: HEADER_ROW_GAP,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingLeft: CONTENT_PAD,
            paddingRight: CONTENT_PAD,
            background: 'transparent',
          }}
        >
          <Title order={3} style={{ color: 'var(--page-accent)' }}>
            {pageTitle}
          </Title>

          <Box ref={headerRightRef} />
        </Box>

        <Paper
          bg="white"
          radius="lg"
          shadow="xl"
          p={0}
          style={{
            height: `calc(100dvh - (2 * ${OUTER_PAD}) - ${NAV_ROW_HEIGHT_PX}px - ${HEADER_ROW_GAP})`,
            overflow: 'auto',
          }}
        >
          <Box p="xl">
            <Outlet context={{ headerRightRef }} />
          </Box>
        </Paper>
      </Box>
    </Box>
  )
}
