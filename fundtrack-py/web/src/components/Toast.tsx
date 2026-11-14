import React, { createContext, useCallback, useContext, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { cn } from './ui'

type Kind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: Kind; text: string }

const Ctx = createContext<{ push: (kind: Kind, text: string) => void } | null>(null)
let nextId = 1

const KIND_STYLE: Record<Kind, { box: string; icon: React.ReactNode }> = {
  success: { box: 'border-positive/40', icon: <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" /> },
  error: { box: 'border-negative/40', icon: <AlertTriangle className="h-4 w-4 shrink-0 text-negative" /> },
  info: { box: 'border-accent/40', icon: <Info className="h-4 w-4 shrink-0 text-accent" /> },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((kind: Kind, text: string) => {
    const id = nextId++
    // only one toast at a time — a new notification replaces the current one
    setItems([{ id, kind, text }])
    window.setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])

  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed left-1/2 top-20 z-[100] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col items-center">
        {items.map(t => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm text-foreground shadow-2xl',
              'animate-[toast-in_.25s_ease-out]',
              KIND_STYLE[t.kind].box,
            )}
            style={{
              background: 'color-mix(in srgb, var(--bg) 92%, var(--card))',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
            }}
          >
            {KIND_STYLE[t.kind].icon}
            <span className="leading-snug">{t.text}</span>
          </div>
        ))}
      </div>
      <style>{`@keyframes toast-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </Ctx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
