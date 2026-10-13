import type { ImportedHistory } from './browser-history'

/* The imported copy lives in this origin's IndexedDB on this device only, one record; deleting it drops the database. */

const DATABASE = 'yt-client-history'
const STORE = 'imports'
const KEY = 'browser'

const settle = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error)
})

// a read never creates the database: its upgrade is aborted, so a page that only looks leaves nothing behind
const openDatabase = (create: boolean) => {
  const open = indexedDB.open(DATABASE, 1)
  open.onupgradeneeded = () => {
    if (create) open.result.createObjectStore(STORE)
    else open.transaction?.abort()
  }
  return settle(open)
}

const withStore = async <T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase(mode === 'readwrite')
  try {
    const transaction = database.transaction(STORE, mode)
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    const [result] = await Promise.all([settle(work(transaction.objectStore(STORE))), done])
    return result
  } finally {
    database.close()
  }
}

export const readImportedHistory = async (): Promise<ImportedHistory | undefined> => {
  const stored = await withStore('readonly', (store) => store.get(KEY) as IDBRequest<unknown>).catch((error: unknown) => {
    if (error instanceof DOMException && error.name === 'AbortError') return undefined
    throw error
  })
  return Array.isArray((stored as Partial<ImportedHistory> | undefined)?.entries) ? stored as ImportedHistory : undefined
}

export const saveImportedHistory = async (history: ImportedHistory) => {
  await withStore('readwrite', (store) => store.put(history, KEY))
}

export const deleteImportedHistory = () => settle(indexedDB.deleteDatabase(DATABASE)).then(() => {})
