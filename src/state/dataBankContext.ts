import { createContext, useContext } from 'react'
import type { CarmaTable, Category, CfTable, DataBank, TableData } from './dataBank'

type DataBankContextValue = {
  bank: DataBank
  setTable: (args: {
    category: Category
    table: CfTable | CarmaTable
    data: TableData
  }) => void
}

export type { DataBankContextValue }

export const DataBankContext = createContext<DataBankContextValue | null>(null)

export function useDataBank(): DataBankContextValue {
  const ctx = useContext(DataBankContext)
  if (!ctx) {
    throw new Error('useDataBank must be used inside DataBankProvider')
  }
  return ctx
}
