const READS = 3

/**
 * Reads an answer up to three times, again after 500 ms and then after 1 s, for as long as `again`
 * holds for the answer just read (whose body is then dropped), and hands back the last answer read.
 */
export const readAgain = async (
  read: () => Promise<Response>,
  again: (response: Response) => boolean | Promise<boolean>,
  onAgain: (response: Response) => void,
) => {
  for (let attempt = 1; ; attempt += 1) {
    const response = await read()
    if (attempt === READS || !(await again(response))) return response
    void response.body?.cancel().catch(() => {})
    onAgain(response)
    await new Promise((resolve) => { setTimeout(resolve, 250 * 2 ** attempt) })
  }
}
