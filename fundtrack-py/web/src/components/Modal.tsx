import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn, Card, CardContent, CardHeader, CardTitle } from './ui'

export function Modal({ open, onClose, title, children, size = 'md', className }: {
  open: boolean
  onClose: () => void
  title?: React.ReactNode
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const widths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center overflow-y-auto bg-background/70 p-4 backdrop-blur-sm">
      <Card className={cn('my-auto flex max-h-[90vh] w-full flex-col', widths[size], className)}>
        {title && (
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center justify-between gap-4 text-base">
              <span>{title}</span>
              <button type="button" onClick={onClose} className="rounded-lg p-1 text-muted transition hover:bg-elevated hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="overflow-y-auto">{children}</CardContent>
      </Card>
    </div>,
    document.body,
  )
}
