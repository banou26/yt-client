// scramjet-controller's own names: every Controller of the origin persists its whole jar there, as a JSON object keyed `domain@path@name`
const JAR_DB = '__scramjet_controller'
const JAR_STORE = 'state'
const JAR_KEY = 'cookies'

export type JarCookie = { name: string, domain: string, expires?: number }

/** Whether the jar holds a live youtube.com SAPISID, the cookie the engine signs its requests with. */
export const holdsSession = (cookies: JarCookie[], now = Date.now()) =>
  cookies.some((cookie) => cookie.name === 'SAPISID' && cookie.domain === '.youtube.com' && (cookie.expires === undefined || cookie.expires > now))

/**
 * Reads the Scramjet jar the engine and the sign-in window share, as last persisted. Resolves empty when there is
 * none or it cannot be read, and never creates the database.
 */
export const readJar = () => new Promise<JarCookie[]>((resolve) => {
  try {
    const request = indexedDB.open(JAR_DB)
    // a versionless open of a missing database creates an empty v1 one, which the controller's own open would then never upgrade
    request.onupgradeneeded = () => {
      try {
        request.transaction?.abort()
      } catch {}
    }
    request.onerror = () => resolve([])
    request.onsuccess = () => {
      const database = request.result
      const done = (cookies: JarCookie[]) => {
        database.close()
        resolve(cookies)
      }
      try {
        const get = database.transaction(JAR_STORE, 'readonly').objectStore(JAR_STORE).get(JAR_KEY)
        get.onerror = () => done([])
        get.onsuccess = () => {
          try {
            const dump = (get.result as { cookies?: string } | undefined)?.cookies
            done(dump ? Object.values(JSON.parse(dump) as Record<string, JarCookie>) : [])
          } catch {
            done([])
          }
        }
      } catch {
        done([])
      }
    }
  } catch {
    resolve([])
  }
})

export const jarHoldsSession = async () => holdsSession(await readJar())
