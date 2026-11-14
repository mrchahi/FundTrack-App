import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api } from './api'
import type { Account, Settings } from './types'
import { DEFAULT_SETTINGS } from './types'

interface AppCtx {
  settings: Settings
  accounts: Account[]
  activeLogin: number | null
  setActiveLogin: (v: number | null) => void
  refreshAccounts: () => Promise<void>
  refreshSettings: () => Promise<Settings>
  updateSettings: (patch: Partial<Settings> & { security_pin?: string }) => Promise<void>
  updateAccount: (login: number, patch: Partial<Account>) => Promise<void>
  activeAccount: Account | undefined
  locked: boolean
  lock: () => void
  unlock: (pin: string) => Promise<boolean>
  setPin: (pin: string) => Promise<void>
}

const Ctx = createContext<AppCtx | null>(null)

const BG_PRESETS: Record<string, { light: string; dark: string }> = {
  aurora: { light: 'radial-gradient(1200px 700px at 15% 10%, #cffafe 0%, transparent 55%), radial-gradient(1000px 600px at 85% 20%, #ede9fe 0%, transparent 50%), radial-gradient(900px 700px at 60% 90%, #fce7f3 0%, transparent 55%)', dark: 'radial-gradient(1200px 700px at 15% 10%, rgba(14,165,233,.35) 0%, transparent 55%), radial-gradient(1000px 600px at 85% 20%, rgba(139,92,246,.28) 0%, transparent 50%), radial-gradient(900px 700px at 60% 90%, rgba(236,72,153,.22) 0%, transparent 55%)' },
  ember: { light: 'radial-gradient(1200px 700px at 80% 0%, #fef3c7 0%, transparent 55%), radial-gradient(1000px 800px at 10% 80%, #fee2e2 0%, transparent 55%)', dark: 'radial-gradient(1200px 700px at 80% 0%, rgba(251,146,60,.28) 0%, transparent 55%), radial-gradient(1000px 800px at 10% 80%, rgba(244,63,94,.22) 0%, transparent 55%)' },
  forest: { light: 'radial-gradient(1200px 700px at 10% 0%, #dcfce7 0%, transparent 55%), radial-gradient(1000px 800px at 90% 90%, #d1fae5 0%, transparent 55%)', dark: 'radial-gradient(1200px 700px at 10% 0%, rgba(16,185,129,.28) 0%, transparent 55%), radial-gradient(1000px 800px at 90% 90%, rgba(5,150,105,.22) 0%, transparent 55%)' },
  ocean: { light: 'radial-gradient(1200px 700px at 50% 0%, #e0f2fe 0%, transparent 55%), radial-gradient(1100px 800px at 50% 100%, #ccfbf1 0%, transparent 55%)', dark: 'radial-gradient(1200px 700px at 50% 0%, rgba(14,116,210,.30) 0%, transparent 55%), radial-gradient(1100px 800px at 50% 100%, rgba(13,148,136,.24) 0%, transparent 55%)' },
}

function applyDomAttrs(settings: Settings | null) {
  const el = document.documentElement
  const isLight = settings?.theme === 'frosted-light'
  el.classList.toggle('light', isLight)
  el.setAttribute('data-theme', settings?.theme ?? 'obsidian')
  el.setAttribute('data-accent', settings?.accent ?? 'indigo')
  el.setAttribute('lang', settings?.lang ?? 'fa')
  el.dir = settings?.lang === 'en' ? 'ltr' : 'rtl'
  el.style.setProperty('--scheme', isLight ? 'light' : 'dark')

  // background wallpaper (preset gradients or custom URL) + blur + brightness
  const bg = settings?.bg_image ?? 'none'
  const bgBlur = typeof settings?.bg_blur === 'number' ? settings.bg_blur : 0.5
  el.style.setProperty('--bg-blur', `${Math.round(4 + bgBlur * 60)}px`)
  const brightVal = typeof settings?.bg_brightness === 'number' ? settings.bg_brightness : 0
  const bright = 1 + (brightVal / 100) * 0.6 // -100→0.4, 0→1, +100→1.6
  el.style.setProperty('--bg-brightness', String(bright))
  if (bg && bg !== 'none' && (bg.startsWith('http') || bg.startsWith('data:'))) {
    el.style.setProperty('--bg-image', `url("${bg}")`)
  } else if (bg === 'default') {
    // bundled default wallpaper (offline-friendly SVG), theme-aware variant
    el.style.setProperty('--bg-image', `url("/wallpapers/default-${isLight ? 'light' : 'dark'}.svg")`)
  } else if (bg && BG_PRESETS[bg]) {
    el.style.setProperty('--bg-image', BG_PRESETS[bg][isLight ? 'light' : 'dark'])
  } else {
    el.style.removeProperty('--bg-image')
  }

  const intensity = typeof settings?.glass_intensity === 'number' ? settings.glass_intensity : 0.66
  const blur = Math.round(8 + intensity * 28)
  const reflection = 0.06 + intensity * 0.24
  el.style.setProperty('--glass-blur', `${blur}px`)
  el.style.setProperty('--glass-reflection', reflection.toFixed(3))

  const matte = typeof settings?.matte_intensity === 'number' ? settings.matte_intensity : 0.5
  const fill = 0.035 + matte * 0.12
  el.style.setProperty('--glass-fill', fill.toFixed(3))

  const cardBlur = typeof settings?.card_blur === 'number' ? settings.card_blur : 0.6
  const cardContrast = typeof settings?.card_contrast === 'number' ? settings.card_contrast : 0.5
  el.style.setProperty('--card-blur', `${Math.round(4 + cardBlur * 36)}px`)
  el.style.setProperty('--card-contrast', String(0.8 + cardContrast * 0.8))
}

/** Apply appearance/theme settings for a live preview without persisting. */
export function applySettingsPreview(s: Settings | null): void {
  applyDomAttrs(s)
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [activeLogin, setActiveLogin] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)

  const refreshAccounts = useCallback(async () => {
    const list = await api.accounts()
    setAccounts(list)
    const visible = list.filter(a => !a.archived).sort((a, b) => (b.last_seen ?? 0) - (a.last_seen ?? 0))
    setActiveLogin(prev => {
      if (prev && visible.some(a => a.login === prev)) return prev
      return visible[0]?.login ?? null
    })
  }, [])

  const refreshSettings = useCallback(async () => {
    const s = await api.settings()
    setSettings(s)
    applyDomAttrs(s)
    return s
  }, [])

  useEffect(() => {
    refreshSettings().catch(() => {})
    refreshAccounts().catch(() => {})
  }, [refreshSettings, refreshAccounts])

  useEffect(() => {
    applyDomAttrs(settings)
  }, [settings])

  // قفل خودکار فقط پس از ۱۵ دقیقه بی‌فعالیتی (نه در شروع/ریلود)
  const idleLockMs = 15 * 60 * 1000
  const pinSet = !!settings?.pin_set
  useEffect(() => {
    if (!pinSet) return
    let timer: number
    const arm = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setLocked(true), idleLockMs)
    }
    const events: (keyof WindowEventMap)[] = ['mousedown', 'keydown', 'scroll', 'touchstart']
    for (const ev of events) window.addEventListener(ev, arm)
    arm()
    return () => {
      window.clearTimeout(timer)
      for (const ev of events) window.removeEventListener(ev, arm)
    }
  }, [pinSet])

  const updateSettings = useCallback(async (patch: Partial<Settings> & { security_pin?: string }) => {
    const s = await api.putSettings(patch)
    setSettings(s)
    applyDomAttrs(s)
  }, [])

  const updateAccount = useCallback(async (login: number, patch: Partial<Account>) => {
    await api.patchAccount(login, patch)
    await refreshAccounts()
  }, [refreshAccounts])

  const unlock = useCallback(async (pin: string) => {
    try {
      const r = await api.verifyPin(pin)
      if (r.ok) { setLocked(false); window.dispatchEvent(new Event('mousedown')); return true }
      return false
    } catch {
      return false
    }
  }, [])

  const lock = useCallback(() => setLocked(true), [])

  const setPin = useCallback(async (pin: string) => {
    await updateSettings({ security_pin: pin })
  }, [updateSettings])

  const activeAccount = useMemo(() => accounts.find(a => a.login === activeLogin), [accounts, activeLogin])

  const value = useMemo(() => ({
    settings: settings ?? DEFAULT_SETTINGS,
    accounts, activeLogin, setActiveLogin,
    refreshAccounts, refreshSettings, updateSettings, updateAccount, activeAccount,
    locked, lock, unlock, setPin,
  }), [settings, accounts, activeLogin, activeAccount, locked, lock, unlock, setPin,
      refreshAccounts, refreshSettings, updateSettings, updateAccount])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useApp outside provider')
  return ctx
}
