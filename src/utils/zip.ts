import JSZip from 'jszip'
import type { Bytes } from './api'

export type ZipCsvEntry = {
  path: string
  text: string
}

export async function extractCsvFilesFromZipBytes(zipBytes: Bytes): Promise<ZipCsvEntry[]> {
  const zip = await JSZip.loadAsync(zipBytes)
  const entries = Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .filter((name) => name.toLowerCase().endsWith('.csv'))
    .sort((a, b) => a.localeCompare(b))

  const results: ZipCsvEntry[] = []
  for (const name of entries) {
    const file = zip.file(name)
    if (!file) continue
    const text = await file.async('string')
    results.push({ path: name, text })
  }

  return results
}
