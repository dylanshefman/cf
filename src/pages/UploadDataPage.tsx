import {
  Box,
  Code,
  Divider,
  Button,
  Combobox,
  Collapse,
  FileButton,
  Group,
  InputBase,
  LoadingOverlay,
  Modal,
  Paper,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  ActionIcon,
  UnstyledButton,
  useCombobox,
} from '@mantine/core'
import { notifications } from '@mantine/notifications'
import {
  IconChevronDown,
  IconChevronRight,
  IconFile,
  IconFileZip,
  IconTable,
  IconUpload,
} from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import type { StandardTableKey, TableData } from '../state/dataBank'
import { CARMA_TABLES, CF_TABLES, guessStandardKeyFromPath, splitStandardKey } from '../state/dataBank'
import { useDataBank } from '../state/dataBankContext'
import { normalizeTableDataOnIngest } from '../state/ingestNormalization'
import { parquetDecrypt, parquetToCsv, zipNormalize } from '../utils/api'
import { parseCsvText } from '../utils/parseCsv'
import { extractCsvFilesFromZipBytes } from '../utils/zip'

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

export function UploadDataPage() {
  const { bank, setTable } = useDataBank()
  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState<string>('')

  const [assignOpen, setAssignOpen] = useState(false)
  const [assignMode, setAssignMode] = useState<'zip' | 'files'>('files')
  const [assignItems, setAssignItems] = useState<PendingFile[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())

  const [expandedBankCategories, setExpandedBankCategories] = useState<Set<'cf' | 'carma'>>(
    new Set(['cf', 'carma']),
  )
  const [expandedBankTables, setExpandedBankTables] = useState<Set<string>>(new Set())

  const bankCfTables = useMemo(() => {
    return CF_TABLES.flatMap((t) => {
      const data = bank.cf[t]
      if (!data) return [] as Array<{ name: string; rows: number; columns: string[]; key: string }>
      return [{ name: t, rows: data.rows.length, columns: data.columns, key: `cf.${t}` }]
    })
  }, [bank.cf])

  const bankCarmaTables = useMemo(() => {
    return CARMA_TABLES.flatMap((t) => {
      const data = bank.carma[t]
      if (!data) return [] as Array<{ name: string; rows: number; columns: string[]; key: string }>
      return [{ name: t, rows: data.rows.length, columns: data.columns, key: `carma.${t}` }]
    })
  }, [bank.carma])

  function toggleBankCategory(category: 'cf' | 'carma') {
    setExpandedBankCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  function toggleBankTable(tableKey: string) {
    setExpandedBankTables((prev) => {
      const next = new Set(prev)
      if (next.has(tableKey)) next.delete(tableKey)
      else next.add(tableKey)
      return next
    })
  }

  const dockWidth = 360

  function DataBankDock() {
    const cfOpen = expandedBankCategories.has('cf')
    const carmaOpen = expandedBankCategories.has('carma')

    const categoryHeader = (label: 'cf' | 'carma', open: boolean) => (
      <Group justify="space-between" wrap="nowrap">
        <Text fw={700}>{label}</Text>
        <ActionIcon variant="subtle" onClick={() => toggleBankCategory(label)} aria-label={`Toggle ${label}`}>
          {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
        </ActionIcon>
      </Group>
    )

    const renderTable = (t: { name: string; rows: number; columns: string[]; key: string }) => {
      const open = expandedBankTables.has(t.key)
      return (
        <Box key={t.key}>
          <Group justify="space-between" wrap="nowrap" onClick={() => toggleBankTable(t.key)} style={{ cursor: 'pointer' }}>
            <Group gap="xs" wrap="nowrap">
              <ActionIcon variant="subtle" aria-label={`Toggle ${t.name}`}>
                {open ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
              </ActionIcon>
              <Text size="sm" fw={600} style={{ whiteSpace: 'nowrap' }}>
                {t.name}
              </Text>
            </Group>

            <Text size="sm" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
              {t.rows.toLocaleString()}
            </Text>
          </Group>

          <Collapse in={open}>
            <Stack gap={4} mt={6} ml={32}>
              {t.columns.map((c) => (
                <Text key={c} size="xs" c="dimmed" style={{ whiteSpace: 'nowrap' }}>
                  <Code>{c}</Code>
                </Text>
              ))}
            </Stack>
          </Collapse>
        </Box>
      )
    }

    return (
      <Paper
        withBorder
        radius={0}
        p="md"
        style={{
          position: 'fixed',
          right: 0,
          top: 56,
          bottom: 0,
          width: dockWidth,
          overflow: 'auto',
        }}
      >
        <Stack gap="sm">
          <Box>
            {categoryHeader('cf', cfOpen)}
            <Collapse in={cfOpen}>
              <Stack gap="xs" mt={8}>
                {bankCfTables.map(renderTable)}
              </Stack>
            </Collapse>
          </Box>

          <Divider />

          <Box>
            {categoryHeader('carma', carmaOpen)}
            <Collapse in={carmaOpen}>
              <Stack gap="xs" mt={8}>
                {bankCarmaTables.map(renderTable)}
              </Stack>
            </Collapse>
          </Box>
        </Stack>
      </Paper>
    )
  }

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
            <Group key={n.path} justify="space-between" align="center" wrap="nowrap" style={{ paddingLeft: pl + 28 }}>
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

  return (
    <Box pos="relative" style={{ paddingRight: dockWidth + 16 }}>
      <LoadingOverlay visible={busy} overlayProps={{ blur: 1 }} loaderProps={{ type: 'dots' }} />

      <DataBankDock />

      <Stack gap="md">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={3}>Upload data</Title>
            <Text c="dimmed" size="sm">
              Upload files, then assign each one to a standard table.
            </Text>
          </div>
          {busyLabel ? (
            <Text size="sm" c="dimmed">
              {busyLabel}
            </Text>
          ) : null}
        </Group>

        <Stack gap="md" style={{ maxWidth: 520 }}>
          <Paper withBorder radius="md" p="md">
            <Title order={5}>Uploads</Title>
            <Text c="dimmed" size="sm" mt={4}>
              Choose a ZIP, CSV(s), or Parquet(s). Assignment happens in a modal.
            </Text>

            <Divider my="md" />

            <Stack gap="sm">
              <FileButton
                onChange={(f) => f && handleZipFile(f)}
                accept="application/zip"
              >
                {(props) => (
                  <Button leftSection={<IconFileZip size={18} />} {...props} disabled={busy}>
                    Upload ZIP
                  </Button>
                )}
              </FileButton>

              <FileButton
                onChange={(files) => files && handleCsvFiles(files)}
                accept="text/csv"
                multiple
              >
                {(props) => (
                  <Button leftSection={<IconTable size={18} />} {...props} disabled={busy}>
                    Upload CSV
                  </Button>
                )}
              </FileButton>

              <FileButton
                onChange={(files) => files && handleParquetFiles(files)}
                accept=".parquet,.parquet.gpg"
                multiple
              >
                {(props) => (
                  <Button leftSection={<IconUpload size={18} />} {...props} disabled={busy}>
                    Upload Parquet
                  </Button>
                )}
              </FileButton>
            </Stack>
          </Paper>
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
      </Stack>
    </Box>
  )
}
