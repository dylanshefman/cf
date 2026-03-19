import { useMemo, useState } from 'react'
import type { CarmaTable, CfTable, DataBank } from './dataBank'
import { emptyDataBank } from './dataBank'
import { DataBankContext } from './dataBankContext'
import type { DataBankContextValue } from './dataBankContext'

export function DataBankProvider({ children }: { children: React.ReactNode }) {
  const [bank, setBank] = useState<DataBank>(emptyDataBank)

  const value = useMemo<DataBankContextValue>(() => {
    return {
      bank,
      setTable: ({ category, table, data }) => {
        setBank((prev) => {
          if (category === 'cf') {
            return {
              ...prev,
              cf: {
                ...prev.cf,
                [table as CfTable]: data,
              },
            }
          }

          return {
            ...prev,
            carma: {
              ...prev.carma,
              [table as CarmaTable]: data,
            },
          }
        })
      },
    }
  }, [bank])

  return <DataBankContext.Provider value={value}>{children}</DataBankContext.Provider>
}
