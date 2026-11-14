import { useCallback, useEffect, useRef, useState } from 'react'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useAsync<T>(fn: () => Promise<T>, deps: React.DependencyList = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fnRef.current().then(
      d => { if (alive) { setData(d); setLoading(false) } },
      e => { if (alive) { setError(e.message ?? String(e)); setLoading(false) } },
    )
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  const refetch = useCallback(() => setTick(t => t + 1), [])
  return { data, loading, error, refetch }
}

/** Poll an API call every `ms` while `enabled`. */
export function usePoll<T>(fn: () => Promise<T>, ms: number, enabled = true): { data: T | null; refetch: () => void } {
  const [data, setData] = useState<T | null>(null)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const run = () => fnRef.current().then(d => { if (alive) setData(d) }).catch(() => {})
    run()
    const id = setInterval(run, ms)
    return () => { alive = false; clearInterval(id) }
  }, [enabled, ms, tick])

  const refetch = useCallback(() => setTick(t => t + 1), [])
  return { data, refetch }
}
