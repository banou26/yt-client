import { useEffect, useState } from 'preact/hooks'

const HIDDEN = { visibility: 'hidden' } as const

/**
 * A thumbnail or avatar drawn over its slot, whose own background is the placeholder.
 *
 * An image that fails to load is hidden, so the slot shows plain rather than with the browser's broken-image icon,
 * and it is asked for once more when the browser comes back online: a failure during a network drop is the one a
 * second try can fix. It always loads lazily and is always decorative.
 */
export const Thumbnail = ({ src, srcSet, sizes }: { src: string, srcSet?: string | null, sizes?: string }) => {
  const [failedSrc, setFailedSrc] = useState<string>()
  const [retried, setRetried] = useState(false)
  const failed = failedSrc === src

  useEffect(() => {
    if (!failed || retried) return
    const retry = () => {
      setFailedSrc(undefined)
      setRetried(true)
    }
    window.addEventListener('online', retry)
    return () => window.removeEventListener('online', retry)
  }, [failed, retried])

  return (
    <img
      // a new element, since Preact leaves an unchanged src alone and the failed one would never ask again
      key={retried ? 'retry' : 'first'}
      src={src}
      srcSet={srcSet ?? undefined}
      sizes={sizes}
      alt=''
      loading='lazy'
      style={failed ? HIDDEN : undefined}
      onError={() => setFailedSrc(src)}
    />
  )
}
