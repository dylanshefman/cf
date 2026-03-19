import { Box, Stack, Table, Text } from '@mantine/core'
import { useId, useMemo } from 'react'
import cfLogoUrl from '../../assets/cf-logo.png'
import kodeLogoUrl from '../../assets/kode-logo.png'
import type { CompareDetails, CompareSegmentKey, MetadataFieldSpec } from './compareTypes'
import { renderCompareCellValue, renderTenantSpaceAssignmentBadges } from './compareCellRenderers'

type CompareDetailsTableProps<UploadedRow, ApiRow, Ctx> = {
  openedSeg: CompareSegmentKey | null
  identifierLabel: string
  entityPluralLabel: string
  details: CompareDetails<UploadedRow, ApiRow>
  metadata: Array<MetadataFieldSpec<UploadedRow, ApiRow, Ctx>>
  maxHeight?: number | string
}

export function getCompareDetailsTitle(openedSeg: CompareSegmentKey | null): string {
  if (!openedSeg) return ''
  if (openedSeg === 'cf') return 'CF only'
  if (openedSeg === 'kode') return 'KODE only'
  if (openedSeg === 'mismatch') return 'Metadata mismatch'
  if (openedSeg === 'both') return 'Both (metadata match)'
  return ''
}

export function CompareDetailsTable<UploadedRow, ApiRow, Ctx>({
  openedSeg,
  identifierLabel,
  entityPluralLabel,
  details,
  metadata,
  maxHeight = 520,
}: CompareDetailsTableProps<UploadedRow, ApiRow, Ctx>) {
  const classIdRaw = useId()
  const tableClassName = useMemo(
    () => `compare-inline-table-${classIdRaw.replace(/[^a-zA-Z0-9_-]/g, '')}`,
    [classIdRaw],
  )

  const containerStyle = useMemo(() => {
    return {
      maxHeight,
      overflow: 'auto',
    } as const
  }, [maxHeight])

  const mismatchBg = 'var(--mantine-color-red-2)'

  if (!openedSeg) return null

  const renderIdentifierCell = (row: any) => {
    const tenant = row?.apiRow?.tenant ?? row?.apiRow?.raw?.tenant
    const space = row?.apiRow?.space ?? null
    if (tenant && space) {
      const node = renderTenantSpaceAssignmentBadges({ tenant, space })
      return node ? node : row?.identifier
    }

    return row?.identifier
  }

  return (
    <>
      <Box
        component="style"
      >{`
        .${tableClassName} thead th {
          position: sticky !important;
          top: 0 !important;
          z-index: 4;
          background: var(--mantine-color-body);
        }

        .${tableClassName} thead tr:nth-child(2) th {
          top: var(--compare-sticky-header-row-h, 38px) !important;
          z-index: 4;
        }

        .${tableClassName} th:first-child,
        .${tableClassName} td:first-child {
          position: sticky;
          left: 0;
          z-index: 2;
        }

        .${tableClassName} thead th:first-child {
          z-index: 6;
          background: var(--mantine-color-body);
        }

        .${tableClassName} tbody tr:nth-child(odd) td:first-child {
          background: var(--mantine-color-body);
        }

        .${tableClassName} tbody tr:nth-child(even) td:first-child {
          background: var(--mantine-color-gray-0);
        }

        .${tableClassName} td {
          white-space: normal;
          overflow: visible;
        }
      `}</Box>

      {openedSeg === 'cf' && (
        <Box style={containerStyle}>
          {details.cfOnly.length === 0 ? (
            <Text size="sm" c="dimmed">
              {`No CF-only ${entityPluralLabel.toLowerCase()}.`}
            </Text>
          ) : (
            <Table
              className={tableClassName}
              striped
              highlightOnHover
              withTableBorder
              withColumnBorders
              style={{ ['--compare-sticky-header-row-h' as any]: '38px' }}
            >
              <Table.Thead>
                <Table.Tr>
                  {Object.keys(details.cfOnly[0] ?? {}).map((k) => (
                    <Table.Th key={k}>{k}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {details.cfOnly.map((row, idx) => (
                  <Table.Tr key={idx}>
                    {Object.keys(details.cfOnly[0] ?? {}).map((k) => (
                      <Table.Td key={k}>{renderCompareCellValue((row as any)?.[k])}</Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Box>
      )}

      {openedSeg === 'kode' && (
        <Box style={containerStyle}>
          {details.kodeOnly.length === 0 ? (
            <Text size="sm" c="dimmed">
              {`No KODE-only ${entityPluralLabel.toLowerCase()}.`}
            </Text>
          ) : (
            <Table
              className={tableClassName}
              striped
              highlightOnHover
              withTableBorder
              withColumnBorders
              style={{ ['--compare-sticky-header-row-h' as any]: '38px' }}
            >
              <Table.Thead>
                <Table.Tr>
                  {Object.keys(details.kodeOnly[0] ?? {}).map((k) => (
                    <Table.Th key={k}>{k}</Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {details.kodeOnly.map((row, idx) => (
                  <Table.Tr key={idx}>
                    {Object.keys(details.kodeOnly[0] ?? {}).map((k) => (
                      <Table.Td key={k}>{renderCompareCellValue((row as any)?.[k])}</Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </Box>
      )}

      {openedSeg === 'both' && (
        <Box style={containerStyle}>
          <Table
            className={tableClassName}
            striped
            highlightOnHover
            withTableBorder
            withColumnBorders
            style={{ ['--compare-sticky-header-row-h' as any]: '38px' }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{identifierLabel}</Table.Th>
                {metadata.map((f) => (
                  <Table.Th key={f.key}>{f.label}</Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {details.both.map((row) => (
                <Table.Tr key={row.identifier}>
                  <Table.Td>{renderIdentifierCell(row)}</Table.Td>
                  {metadata.map((f) => (
                    <Table.Td key={f.key}>{renderCompareCellValue(row.meta[f.key] ?? '')}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {openedSeg === 'mismatch' && (
        <Box style={containerStyle}>
          <Table
            className={tableClassName}
            striped
            highlightOnHover
            withTableBorder
            withColumnBorders
            style={{ ['--compare-sticky-header-row-h' as any]: '38px' }}
          >
            <Table.Thead>
              <Table.Tr>
                <Table.Th rowSpan={2}>{identifierLabel}</Table.Th>
                {metadata.map((f) => (
                  <Table.Th key={f.key} colSpan={2} style={{ textAlign: 'center' }}>
                    {f.label}
                  </Table.Th>
                ))}
              </Table.Tr>

              <Table.Tr>
                {metadata.flatMap((f) => [
                  <Table.Th key={`${f.key}:cf`} style={{ textAlign: 'center' }}>
                    <Stack gap={4} align="center">
                      <Box
                        component="img"
                        src={cfLogoUrl}
                        alt="CF"
                        style={{ width: 18, height: 18, objectFit: 'contain' }}
                      />
                      <Text size="xs" fw={800} c="dimmed">
                        CF
                      </Text>
                    </Stack>
                  </Table.Th>,
                  <Table.Th key={`${f.key}:kode`} style={{ textAlign: 'center' }}>
                    <Stack gap={4} align="center">
                      <Box
                        component="img"
                        src={kodeLogoUrl}
                        alt="KODE"
                        style={{ width: 18, height: 18, objectFit: 'contain' }}
                      />
                      <Text size="xs" fw={800} c="dimmed">
                        KODE
                      </Text>
                    </Stack>
                  </Table.Th>,
                ])}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {details.mismatch.map((row) => (
                <Table.Tr key={row.identifier}>
                  <Table.Td>{renderIdentifierCell(row)}</Table.Td>
                  {metadata.flatMap((f) => {
                    const mismatch = row.mismatchedKeys.includes(f.key)
                    const style = mismatch ? { background: mismatchBg } : undefined
                    return [
                      <Table.Td key={`${row.identifier}:${f.key}:cf`} style={style}>
                        {renderCompareCellValue(row.metaUploaded[f.key] ?? '')}
                      </Table.Td>,
                      <Table.Td key={`${row.identifier}:${f.key}:kode`} style={style}>
                        {renderCompareCellValue(row.metaApi[f.key] ?? '')}
                      </Table.Td>,
                    ]
                  })}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Box>
      )}
    </>
  )
}
