import {
  ActionIcon,
  Box,
  Button,
  Code,
  Combobox,
  Collapse,
  Divider,
  Group,
  InputBase,
  LoadingOverlay,
  Menu,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  UnstyledButton,
  useCombobox,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconChevronDown,
  IconChevronRight,
  IconChevronUp,
  IconFile,
  IconFileZip,
  IconTable,
  IconUpload,
} from '@tabler/icons-react'
import type { ChangeEvent } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import type { StandardTableKey, TableData } from '../state/dataBank'
import { CARMA_TABLES, CF_TABLES, guessStandardKeyFromPath, splitStandardKey } from '../state/dataBank'
import { useDataBank } from '../state/dataBankContext'
import { normalizeTableDataOnIngest } from '../state/ingestNormalization'
import { parquetDecrypt, parquetToCsv, zipNormalize } from '../utils/api'
import { parseCsvText } from '../utils/parseCsv'
import { extractCsvFilesFromZipBytes } from '../utils/zip'
import type { LayoutOutletContext } from '../layout/EnforcedLayout'

type PendingFile = {
  id: string
  displayPath: string
  origin: 'zip' | 'csv' | 'parquet'
  columns: string[]
  rows: Record<string, unknown>[]
  assignment?: StandardTableKey
  suggested?: StandardTableKey
  error?: string
}

function nowIso() {
  return new Date().toISOString()
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}

function autoExpandFirstTwoLayers(filePaths: string[]): Set<string> {
  const expanded = new Set<string>()
  for (const p of filePaths) {
    const parts = p.split('/').filter(Boolean)
    if (parts.length >= 1) {
      expanded.add(parts[0])
    }
    if (parts.length >= 2) {
      expanded.add(`${parts[0]}/${parts[1]}`)
    }
  }
  return expanded
}

function TablePicker({
  value,
  onChange,
  disabled,
  width,
}: {
  value?: StandardTableKey
  onChange: (next: StandardTableKey | undefined) => void
  disabled?: boolean
  width: number
}) {
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  })

  const label = value ? value.split('.')[1] : ''

  const optionButton = (key: StandardTableKey) => (
    <Combobox.Option key={key} value={key}>
      <UnstyledButton
        w="100%"
        onClick={() => {
          onChange(key)
          combobox.closeDropdown()
        }}
        style={{ textAlign: 'left' }}
      >
        <Text size="sm" style={{ whiteSpace: 'nowrap' }}>
          {key.split('.')[1]}
        </Text>
      </UnstyledButton>
    </Combobox.Option>
  )

  return (
    <Combobox store={combobox} withinPortal={false}>
      <Combobox.Target>
        <InputBase
          component="button"
          type="button"
          disabled={disabled}
          onClick={() => combobox.toggleDropdown()}
          rightSection={<Combobox.Chevron />}
          pointer
          w={width}
          styles={{
            input: {
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontWeight: label ? 600 : 400,
            },
          }}
        >
          {label ? (
            <Text size="sm">{label}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              Assign…
            </Text>
          )}
        </InputBase>
      </Combobox.Target>

      <Combobox.Dropdown>
        <ScrollArea.Autosize mah={260} type="auto">
          <Group align="flex-start" gap="xs" wrap="nowrap" p="xs">
            <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={700} c="dimmed">
                cf
              </Text>
              {CF_TABLES.map((t) => optionButton(`cf.${t}` as const))}
            </Stack>

            <Divider orientation="vertical" />

            <Stack gap={6} style={{ flex: 1, minWidth: 0 }}>
              <Text size="xs" fw={700} c="dimmed">
                carma
              </Text>
              {CARMA_TABLES.map((t) => optionButton(`carma.${t}` as const))}
            </Stack>
          </Group>
        </ScrollArea.Autosize>

        <Divider />
        <Group justify="space-between" p="xs">
          <Text size="xs" c="dimmed">
            Pick one table
          </Text>
          <Button
            size="xs"
            variant="subtle"
            onClick={() => {
              onChange(undefined)
              combobox.closeDropdown()
            }}
            disabled={!value}
          >
            Clear
          </Button>
        </Group>
      </Combobox.Dropdown>
    </Combobox>
  )
}

type TreeNode =
  | {
      kind: 'dir'
      name: string
      path: string
      children: TreeNode[]
    }
  | {
      kind: 'file'
      name: string
      path: string
    }

function buildTree(filePaths: string[]): TreeNode[] {
  type Dir = { children: Map<string, Dir | null> }
  const root: Dir = { children: new Map() }

  for (const p of filePaths) {
    const parts = p.split('/').filter(Boolean)
    let cur = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1

      if (isLeaf) {
        cur.children.set(part, null)
      } else {
        const next = cur.children.get(part)
        if (next === null || next === undefined) {
          const created: Dir = { children: new Map() }
          cur.children.set(part, created)
          cur = created
        } else {
          cur = next
        }
      }
    }
  }

  function toNodes(dir: Dir, basePath: string): TreeNode[] {
    const entries = Array.from(dir.children.entries()).sort(([a], [b]) => a.localeCompare(b))
    return entries.map(([name, child]) => {
      const path = basePath ? `${basePath}/${name}` : name
      if (child === null) {
        return { kind: 'file', name, path }
      }
      return { kind: 'dir', name, path, children: toNodes(child, path) }
    })
  }

  return toNodes(root, '')
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function DataPage() {
  const { bank, setTable } = useDataBank()
  const [searchParams, setSearchParams] = useSearchParams()
  const { headerRightRef } = useOutletContext<LayoutOutletContext>()
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string>('')
  const [headerReady, setHeaderReady] = useState(false)

  const zipInputRef = useRef<HTMLInputElement | null>(null)
  const csvInputRef = useRef<HTMLInputElement | null>(null)
  const parquetInputRef = useRef<HTMLInputElement | null>(null)

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMode, setAssignMode] = useState<'zip' | 'files'>('files')
  const [assignItems, setAssignItems] = useState<PendingFile[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const tableParam = searchParams.get('table')
  const selectedTableKey: StandardTableKey | undefined = tableParam ? (tableParam as StandardTableKey) : undefined

  const bankCfTables = useMemo(() => {
    return CF_TABLES.flatMap((t) => {
      const data = bank.cf[t]
      if (!data) return [] as Array<{ name: string; rows: number; columns: string[]; key: StandardTableKey }>
      return [{ name: t, rows: data.rows.length, columns: data.columns, key: `cf.${t}` as const }]
    })
  }, [bank.cf])

  const bankCarmaTables = useMemo(() => {
    return CARMA_TABLES.flatMap((t) => {
      const data = bank.carma[t]
      if (!data) return [] as Array<{ name: string; rows: number; columns: string[]; key: StandardTableKey }>
      return [{ name: t, rows: data.rows.length, columns: data.columns, key: `carma.${t}` as const }]
    })
  }, [bank.carma])

  useEffect(() => {
    if (searchParams.get('table')) return
    const first = bankCfTables[0]?.key ?? bankCarmaTables[0]?.key
    if (!first) return
    const next = new URLSearchParams(searchParams)
    next.set('table', first)
    setSearchParams(next, { replace: true })
  }, [bankCarmaTables, bankCfTables, searchParams, setSearchParams])

  useEffect(() => {
    if (headerRightRef.current) setHeaderReady(true)
  }, [headerRightRef])

  async function csvTextToPending(args: {
    displayPath: string
    origin: PendingFile['origin']
    text: string
  }): Promise<PendingFile> {
    const suggested = guessStandardKeyFromPath(args.displayPath)

    const parsed = parseCsvText(args.text)
    return {
      id: crypto.randomUUID(),
      displayPath: args.displayPath,
      origin: args.origin,
      columns: parsed.columns,
      rows: parsed.rows,
      suggested,
      assignment: undefined,
    }
  }

  function openAssignModal(mode: 'zip' | 'files', items: PendingFile[]) {
    setAssignMode(mode)
    setAssignItems(items)
    setExpandedDirs(mode === 'zip' ? autoExpandFirstTwoLayers(items.map((i) => i.displayPath)) : new Set())
    setAssignOpen(true)
  }

  async function handleZipFile(file: File) {
    if (!file) return

    setBusy(true)
    setBusyLabel('Normalizing ZIP (decrypting parquets + converting to CSV)…')

    try {
      const raw = new Uint8Array(await file.arrayBuffer())
      const normalizedZip = await zipNormalize(raw)
      const csvEntries = await extractCsvFilesFromZipBytes(normalizedZip)

      if (!csvEntries.length) {
        notifications.show({
          color: 'yellow',
          title: 'No CSVs found',
          message: 'ZIP normalization succeeded, but no CSV files were produced.',
        })
        return
      }

      setBusyLabel('Parsing CSVs…')

      const items: PendingFile[] = []
      for (const entry of csvEntries) {
        try {
          items.push(
            await csvTextToPending({
              displayPath: entry.path,
              origin: 'zip',
              text: entry.text,
            }),
          )
        } catch (e) {
          items.push({
            id: crypto.randomUUID(),
            displayPath: entry.path,
            origin: 'zip',
            columns: [],
            rows: [],
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      openAssignModal('zip', items)
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'ZIP upload failed',
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  async function handleCsvFiles(files: File[]) {
    if (!files.length) return

    setBusy(true)
    setBusyLabel('Parsing CSV…')

    try {
      const items: PendingFile[] = []
      for (const file of files) {
        try {
          const text = await file.text()
          items.push(await csvTextToPending({ displayPath: file.name, origin: 'csv', text }))
        } catch (e) {
          items.push({
            id: crypto.randomUUID(),
            displayPath: file.name,
            origin: 'csv',
            columns: [],
            rows: [],
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      openAssignModal('files', items)
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'CSV upload failed',
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  async function handleParquetFiles(files: File[]) {
    if (!files.length) return

    setBusy(true)
    setBusyLabel('Converting parquet to CSV…')

    try {
      const items: PendingFile[] = []
      for (const file of files) {
        try {
          const nameLower = file.name.toLowerCase()
          const raw = new Uint8Array(await file.arrayBuffer())

          let parquetBytes = raw
          if (nameLower.endsWith('.parquet.gpg')) {
            setBusyLabel(`Decrypting ${file.name}…`)
            parquetBytes = await parquetDecrypt(raw)
          }

          setBusyLabel(`Converting ${file.name} to CSV…`)
          const csvBytes = await parquetToCsv(parquetBytes)
          const csvText = decodeUtf8(csvBytes)

          items.push(await csvTextToPending({ displayPath: file.name, origin: 'parquet', text: csvText }))
        } catch (e) {
          items.push({
            id: crypto.randomUUID(),
            displayPath: file.name,
            origin: 'parquet',
            columns: [],
            rows: [],
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }

      openAssignModal('files', items)
    } catch (e) {
      notifications.show({
        color: 'red',
        title: 'Parquet upload failed',
        message: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setBusy(false)
      setBusyLabel('')
    }
  }

  function updateAssignment(id: string, next: StandardTableKey | null) {
    setAssignItems((prev) => prev.map((p) => (p.id === id ? { ...p, assignment: next ?? undefined } : p)))
  }

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  function confirmAssignments() {
    const valid = assignItems.filter((p) => p.assignment && !p.error)
    if (!valid.length) {
      notifications.show({
        color: 'yellow',
        title: 'Nothing to add',
        message: 'Assign at least one file to a standard table first.',
      })
      return
    }

    for (const p of valid) {
      const standardKey = p.assignment!
      const { category, table } = splitStandardKey(standardKey)
      let data: TableData = {
        columns: p.columns,
        rows: p.rows,
        sourceLabel: p.displayPath,
        ingestedAtIso: nowIso(),
      }
      data = normalizeTableDataOnIngest(standardKey, data)
      setTable({ category, table, data })
    }

    setAssignOpen(false)
    setAssignItems([])

    const firstAssigned = valid[0]?.assignment
    if (firstAssigned) {
      const next = new URLSearchParams(searchParams)
      next.set('table', firstAssigned)
      setSearchParams(next)
    }

    notifications.show({
      color: 'green',
      title: 'Data bank updated',
      message: `Added ${valid.length} table(s).`,
    })
  }

  const hasAnyAssignment = assignItems.some((i) => i.assignment && !i.error)

  const zipTree = useMemo(() => {
    if (assignMode !== 'zip') return [] as TreeNode[]
    return buildTree(assignItems.map((i) => i.displayPath))
  }, [assignItems, assignMode])

  const itemByPath = useMemo(() => {
    const m = new Map<string, PendingFile>()
    for (const it of assignItems) m.set(it.displayPath, it)
    return m
  }, [assignItems])

  function renderTree(nodes: TreeNode[], depth = 0) {
    return (
      <Stack gap={4}>
        {nodes.map((n) => {
          const pl = depth * 16
          if (n.kind === 'dir') {
            const open = expandedDirs.has(n.path)
            return (
              <Box key={n.path}>
                <Group gap="xs" wrap="nowrap" style={{ paddingLeft: pl }}>
                  <ActionIcon variant="subtle" onClick={() => toggleDir(n.path)}>
                    {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                  </ActionIcon>
                  <Text fw={600}>{n.name}</Text>
                </Group>
                <Collapse in={open}>
                  <Box mt={4}>{renderTree(n.children, depth + 1)}</Box>
                </Collapse>
              </Box>
            )
          }

          const item = itemByPath.get(n.path)
          if (!item) return null

          return (
            <Group
              key={n.path}
              justify="space-between"
              align="center"
              wrap="nowrap"
              style={{ paddingLeft: pl + 28 }}
            >
              <Group gap={8} wrap="nowrap" align="flex-start">
                <IconFile size={16} />
                <Stack gap={0}>
                  <Text size="sm" lineClamp={1}>
                    {n.name}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {item.rows.length.toLocaleString()} rows
                  </Text>
                </Stack>
              </Group>

              <Box w={340}>
                <TablePicker
                  value={item.assignment}
                  onChange={(v) => updateAssignment(item.id, (v ?? null) as StandardTableKey | null)}
                  disabled={Boolean(item.error)}
                  width={340}
                />
              </Box>
            </Group>
          )
        })}
      </Stack>
    )
  }

  const selectedData = useMemo(() => {
    if (!selectedTableKey) return undefined
    const [category, table] = selectedTableKey.split('.') as ['cf' | 'carma', string]
    if (category === 'cf') return bank.cf[table as (typeof CF_TABLES)[number]]
    return bank.carma[table as (typeof CARMA_TABLES)[number]]
  }, [bank, selectedTableKey])

  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)

  useEffect(() => {
    setSortKey(null)
    setSortDir(null)
  }, [selectedTableKey])

  const viewerRows = useMemo(() => {
    if (!selectedData) return [] as Array<Record<string, unknown>>
    const MAX = 1000
    return selectedData.rows.slice(0, MAX)
  }, [selectedData])

  const sortedViewerRows = useMemo(() => {
    if (!sortKey || !sortDir) return viewerRows

    const dir = sortDir === 'asc' ? 1 : -1
    const rows = [...viewerRows]

    const toComparable = (value: unknown): { kind: number; v: string | number } => {
      if (value === null || value === undefined) return { kind: 9, v: '' }
      if (typeof value === 'number') return { kind: 0, v: value }
      if (typeof value === 'boolean') return { kind: 1, v: value ? 1 : 0 }
      if (typeof value === 'string') return { kind: 2, v: value.toLowerCase() }
      try {
        return { kind: 3, v: JSON.stringify(value).toLowerCase() }
      } catch {
        return { kind: 3, v: String(value).toLowerCase() }
      }
    }

    rows.sort((a, b) => {
      const av = toComparable(a[sortKey])
      const bv = toComparable(b[sortKey])

      if (av.kind === 9 && bv.kind !== 9) return 1
      if (av.kind !== 9 && bv.kind === 9) return -1

      if (av.kind !== bv.kind) return (av.kind - bv.kind) * dir
      if (av.v < bv.v) return -1 * dir
      if (av.v > bv.v) return 1 * dir
      return 0
    })

    return rows
  }, [sortDir, sortKey, viewerRows])

  const cycleSortForColumn = (column: string) => {
    if (sortKey !== column) {
      setSortKey(column)
      setSortDir('asc')
      return
    }

    if (sortDir === null) {
      setSortDir('asc')
      return
    }

    if (sortDir === 'asc') {
      setSortDir('desc')
      return
    }

    setSortKey(null)
    setSortDir(null)
  }

  const onZipInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0] ?? null
    event.currentTarget.value = ''
    if (file) handleZipFile(file)
  }

  const onCsvInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : []
    event.currentTarget.value = ''
    if (files.length) handleCsvFiles(files)
  }

  const onParquetInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.currentTarget.files ? Array.from(event.currentTarget.files) : []
    event.currentTarget.value = ''
    if (files.length) handleParquetFiles(files)
  }

  const headerUpload = headerReady && headerRightRef.current
    ? createPortal(
        <>
          <Menu withinPortal={false} position="bottom-end" shadow="xs">
            <Menu.Target>
              <Button
                rightSection={<IconChevronDown size={16} />}
                disabled={busy}
                styles={{
                  root: {
                    backgroundImage: 'var(--page-accent-bg)',
                  },
                }}
              >
                Upload
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconFileZip size={16} />} onClick={() => zipInputRef.current?.click()}>
                ZIP
              </Menu.Item>

              <Menu.Item leftSection={<IconTable size={16} />} onClick={() => csvInputRef.current?.click()}>
                CSV
              </Menu.Item>

              <Menu.Item leftSection={<IconUpload size={16} />} onClick={() => parquetInputRef.current?.click()}>
                Parquet
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>

          <input
            ref={zipInputRef}
            type="file"
            accept=".zip,application/zip"
            style={{ display: 'none' }}
            onChange={onZipInputChange}
          />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            multiple
            style={{ display: 'none' }}
            onChange={onCsvInputChange}
          />
          <input
            ref={parquetInputRef}
            type="file"
            accept=".parquet,.parquet.gpg"
            multiple
            style={{ display: 'none' }}
            onChange={onParquetInputChange}
          />
        </>,
        headerRightRef.current,
      )
    : null

  const hasSelectedTable = Boolean(selectedTableKey && selectedData)

      return (
        <Box pos="relative" h="100%">
          <LoadingOverlay visible={busy} overlayProps={{ blur: 1 }} loaderProps={{ type: 'dots' }} />

          {headerUpload}

          <Stack gap="md">
            {busyLabel ? (
              <Text size="xs" c="dimmed">
                {busyLabel}
              </Text>
            ) : null}

            {hasSelectedTable ? (
              <Box>
                <Box
                  style={{
                    backgroundImage: 'var(--page-accent-bg)',
                    position: 'sticky',
                    top: 'calc(-1 * var(--mantine-spacing-xl))',
                    marginTop: 'calc(-1 * var(--mantine-spacing-xl))',
                    marginLeft: 'calc(-1 * var(--mantine-spacing-xl))',
                    marginRight: 'calc(-1 * var(--mantine-spacing-xl))',
                    padding: '12px var(--mantine-spacing-xl)',
                    zIndex: 5,
                  }}
                >
                  <Group justify="space-between" wrap="nowrap" align="center" gap="md">
                    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                      <Text fw={900} size="sm" c="white" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {selectedTableKey!.split('.')[1]}
                      </Text>
                      <Box
                        style={{
                          background: 'white',
                          color: 'var(--page-accent)',
                          borderRadius: 9999,
                          padding: '2px 10px',
                          fontSize: 12,
                          fontWeight: 800,
                          lineHeight: '20px',
                          boxShadow: 'var(--mantine-shadow-sm)',
                          flex: '0 0 auto',
                        }}
                      >
                        {selectedTableKey!.split('.')[0]}
                      </Box>

                      <Text size="xs" c="white" style={{ whiteSpace: 'nowrap', opacity: 0.92 }}>
                        {selectedData!.rows.length.toLocaleString()} rows • {selectedData!.columns.length.toLocaleString()} columns
                      </Text>
                    </Group>

                    <Stack gap={2} style={{ flex: '0 0 auto' }} align="flex-end">
                      <Text size="xs" c="white" style={{ whiteSpace: 'nowrap', opacity: 0.92 }}>
                        Showing first {Math.min(1000, selectedData!.rows.length).toLocaleString()}
                      </Text>
                    </Stack>
                  </Group>
                </Box>

                <Stack gap="sm" pt="md">
                  <ScrollArea type="auto">
                    <Table stickyHeader striped highlightOnHover withTableBorder withColumnBorders>
                      <Table.Thead>
                        <Table.Tr>
                          {selectedData!.columns.map((c) => (
                            <Table.Th key={c} style={{ whiteSpace: 'nowrap' }}>
                              <Box style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <Box style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c}</Box>

                                <UnstyledButton
                                  onClick={() => cycleSortForColumn(c)}
                                  aria-label={`Sort by ${c}`}
                                  style={{
                                    width: 18,
                                    height: 21,
                                    position: 'relative',
                                    flex: '0 0 auto',
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Box
                                    style={{
                                      position: 'absolute',
                                      top: 0,
                                      left: 0,
                                      right: 0,
                                      height: 12,
                                      display: 'flex',
                                      alignItems: 'flex-start',
                                      justifyContent: 'center',
                                      opacity: sortKey !== c || sortDir !== 'asc' ? 1 : 0,
                                      pointerEvents: 'none',
                                      color: 'var(--mantine-color-dimmed)',
                                    }}
                                  >
                                    <IconChevronUp size={12} />
                                  </Box>

                                  <Box
                                    style={{
                                      position: 'absolute',
                                      bottom: 0,
                                      left: 0,
                                      right: 0,
                                      height: 12,
                                      display: 'flex',
                                      alignItems: 'flex-end',
                                      justifyContent: 'center',
                                      opacity: sortKey !== c || sortDir !== 'desc' ? 1 : 0,
                                      pointerEvents: 'none',
                                      color: 'var(--mantine-color-dimmed)',
                                    }}
                                  >
                                    <IconChevronDown size={12} />
                                  </Box>
                                </UnstyledButton>
                              </Box>
                            </Table.Th>
                          ))}
                        </Table.Tr>
                      </Table.Thead>

                      <Table.Tbody>
                        {sortedViewerRows.map((row, i) => (
                          <Table.Tr key={i}>
                            {selectedData!.columns.map((c) => (
                              <Table.Td key={c} style={{ whiteSpace: 'nowrap' }}>
                                {formatCell(row[c])}
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  </ScrollArea>
                </Stack>
              </Box>
            ) : (
              <Box style={{ flex: 1, minHeight: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text c="dimmed" size="sm">
                  Upload data, then pick a table in the sidebar.
                </Text>
              </Box>
            )}
          </Stack>

      <Modal
        opened={assignOpen}
        onClose={() => setAssignOpen(false)}
        title={assignMode === 'zip' ? 'Assign tables (ZIP)' : 'Assign tables'}
        size="xl"
      >
        <Stack gap="md">
          <Text c="dimmed" size="sm">
            Assign each file to one standard table.
          </Text>

          {assignItems.some((i) => i.error) ? (
            <Paper withBorder p="sm" radius="md">
              <Text fw={600} size="sm">
                Some files could not be parsed
              </Text>
              <Stack gap={6} mt={6}>
                {assignItems
                  .filter((i) => i.error)
                  .slice(0, 5)
                  .map((i) => (
                    <Text key={i.id} size="xs" c="red">
                      <Code>{i.displayPath}</Code>: {i.error}
                    </Text>
                  ))}
              </Stack>
            </Paper>
          ) : null}

          {assignMode === 'zip' ? (
            <Paper withBorder p="sm" radius="md">
              {renderTree(zipTree)}
            </Paper>
          ) : (
            <Table withTableBorder withColumnBorders>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>File</Table.Th>
                  <Table.Th>Rows</Table.Th>
                  <Table.Th>Assign</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {assignItems.map((p) => (
                  <Table.Tr key={p.id}>
                    <Table.Td>
                      <Stack gap={2}>
                        <Text size="sm" fw={600} lineClamp={1}>
                          {p.displayPath}
                        </Text>
                        {p.suggested ? (
                          <Text size="xs" c="dimmed">
                            suggested: <Code>{p.suggested}</Code>
                          </Text>
                        ) : null}
                        {p.error ? (
                          <Text size="xs" c="red">
                            {p.error}
                          </Text>
                        ) : null}
                      </Stack>
                    </Table.Td>
                    <Table.Td>
                      <Text size="sm">{p.rows.length.toLocaleString()}</Text>
                    </Table.Td>
                    <Table.Td>
                      <TablePicker
                        value={p.assignment}
                        onChange={(v) => updateAssignment(p.id, (v ?? null) as StandardTableKey | null)}
                        disabled={Boolean(p.error)}
                        width={340}
                      />
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}

          <Group justify="flex-end">
            <Button variant="default" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAssignments} disabled={!hasAnyAssignment}>
              Continue
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Box>
  )
}
