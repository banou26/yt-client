import { createHash, generateKeyPairSync, sign } from 'node:crypto'

const der = (tag: number, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts)
  const size: number[] = []
  for (let rest = body.length; rest > 0; rest >>= 8) size.unshift(rest & 0xff)
  const length = body.length < 0x80 ? [body.length] : [0x80 | size.length, ...size]
  return Buffer.concat([Buffer.from([tag, ...length]), body])
}

const sequence = (...parts: Buffer[]) => der(0x30, ...parts)

const oid = (dotted: string) => {
  const [first = 0, second = 0, ...rest] = dotted.split('.').map(Number)
  const bytes = [40 * first + second]
  for (const arc of rest) {
    const chunk = [arc & 0x7f]
    for (let high = arc >> 7; high > 0; high >>= 7) chunk.unshift(0x80 | (high & 0x7f))
    bytes.push(...chunk)
  }
  return der(0x06, Buffer.from(bytes))
}

const utcTime = (date: Date) => der(0x17, Buffer.from(`${date.toISOString().replace(/[-:T]/g, '').slice(2, 14)}Z`))

const pem = (label: string, body: Buffer) =>
  `-----BEGIN ${label}-----\n${body.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`

/** A throwaway P-256 key and a self-signed certificate naming `host`, valid for a day, plus the SPKI hash that
 * Chrome's `--ignore-certificate-errors-spki-list` takes to accept it. */
export const selfSigned = (host: string) => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const spki = publicKey.export({ type: 'spki', format: 'der' })
  const ecdsaSha256 = sequence(oid('1.2.840.10045.4.3.2'))
  const name = sequence(der(0x31, sequence(oid('2.5.4.3'), der(0x0c, Buffer.from(host)))))
  const now = Date.now()
  const subjectAltName = sequence(oid('2.5.29.17'), der(0x04, sequence(der(0x82, Buffer.from(host)))))
  const tbs = sequence(
    der(0xa0, der(0x02, Buffer.from([2]))),
    der(0x02, Buffer.from([1])),
    ecdsaSha256,
    name,
    sequence(utcTime(new Date(now - 3_600_000)), utcTime(new Date(now + 86_400_000))),
    name,
    spki,
    der(0xa3, sequence(subjectAltName)),
  )
  const certificate = sequence(tbs, ecdsaSha256, der(0x03, Buffer.from([0]), sign('sha256', tbs, privateKey)))
  return {
    key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    cert: pem('CERTIFICATE', certificate),
    spki: createHash('sha256').update(spki).digest('base64'),
  }
}
