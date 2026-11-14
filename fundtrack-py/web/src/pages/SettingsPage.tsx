import React, { useEffect, useRef, useState } from 'react'
import { KeyRound, Palette, ShieldCheck, Trash2, Upload } from 'lucide-react'
import { api } from '../api'
import { applySettingsPreview, useApp } from '../store'
import { useToast } from '../components/Toast'
import { useT } from '../lib/i18n'
import { setNavGuard } from '../lib/navGuard'
import { NewsWatchSettings } from '../components/NewsWatchSettings'
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Select, Separator, Switch } from '../components/ui'
import { cn } from '../components/ui'
import { faNum } from '../lib/format'
import type { AccentKey, Settings } from '../types'

const ACCENTS: { key: AccentKey; color: string }[] = [
  { key: 'indigo', color: '#6366f1' },
  { key: 'violet', color: '#7c3aed' },
  { key: 'sky', color: '#0284c7' },
  { key: 'cyan', color: '#0891b2' },
  { key: 'teal', color: '#0d9488' },
  { key: 'emerald', color: '#059669' },
  { key: 'lime', color: '#65a30d' },
  { key: 'amber', color: '#d97706' },
  { key: 'orange', color: '#ea580c' },
  { key: 'rose', color: '#e11d48' },
  { key: 'pink', color: '#db2777' },
]

const THEME_LABELS: Record<string, string> = {
  obsidian: 's.themeObsidian',
  aurora: 's.themeAurora',
  midnight: 's.themeMidnight',
  'frosted-light': 's.themeFrosted',
  cyberpunk: 's.themeCyberpunk',
}

const BG_PRESET_KEYS = ['none', 'default', 'aurora', 'ember', 'forest', 'ocean']

export function SettingsPage() {
  const { settings, updateSettings } = useApp()
  const t = useT(settings.lang)
  const toast = useToast()

  // ---- staged (dirty) display edits ----
  const [draft, setDraft] = useState<Partial<Settings>>({})
  const [pinDraft, setPinDraft] = useState<{ action: 'set' | 'change' | 'remove'; value: string } | null>(null)
  const dirty = Object.keys(draft).length > 0 || !!pinDraft
  const edit = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    setDraft(d => ({ ...d, [key]: value }))
  const val = <K extends keyof Settings>(key: K): Settings[K] =>
    (key in draft ? (draft as Settings)[key] : settings[key])

  // live-apply an appearance field immediately (preview), persist only on Save
  const editLive = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setDraft(d => ({ ...d, [key]: value }))
    applySettingsPreview({ ...settings, ...draft, [key]: value })
  }

  // ---- leave-guard modal ----
  const [showLeave, setShowLeave] = useState(false)
  const [pendingNav, setPendingNav] = useState<string | null>(null)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty

  useEffect(() => {
    setNavGuard(page => {
      if (!dirtyRef.current) return true
      setPendingNav(page)
      setShowLeave(true)
      return false
    })
    return () => setNavGuard(null)
  }, [])

  const saveAll = async (): Promise<boolean> => {
    const payload: Record<string, unknown> = { ...draft }
    if (pinDraft) payload.security_pin = pinDraft.value
    if (!Object.keys(payload).length) return true
    try {
      await updateSettings(payload as Parameters<typeof updateSettings>[0])
      setDraft({})
      setPinDraft(null)
      toast.push('success', t('s.saved'))
      return true
    } catch {
      toast.push('error', t('common.error'))
      return false
    }
  }

  const goTo = (page: string) =>
    window.dispatchEvent(new CustomEvent('fundtrack:navigate', { detail: { page } }))

  const handleSaveLeave = async () => {
    const ok = await saveAll()
    if (ok) { setShowLeave(false); if (pendingNav) goTo(pendingNav) }
  }

  // ---- PIN (immediate, separate flow) ----
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [savingPin, setSavingPin] = useState(false)
  const [pinAction, setPinAction] = useState<'none' | 'change' | 'remove'>('none')
  const [pinStep, setPinStep] = useState<'old' | 'new'>('old')
  const [oldPin, setOldPin] = useState('')
  const [busyPin, setBusyPin] = useState(false)

  const stagePin = (value: string, action: 'set' | 'change' | 'remove') => {
    setPinDraft({ action, value })
    setPin1(''); setPin2(''); setOldPin(''); setPinAction('none'); setPinStep('old')
    toast.push('info', t('s.pinStaged'))
  }

  const savePin = async () => {
    if (pin1.length < 4) { toast.push('error', t('s.pinShort')); return }
    if (pin1 !== pin2) { toast.push('error', t('s.pinMismatch')); return }
    stagePin(pin1, settings.pin_set ? 'change' : 'set')
  }

  const confirmOldPin = async () => {
    if (!oldPin) return
    setBusyPin(true)
    try {
      const r = await api.verifyPin(oldPin)
      if (!r.ok) { toast.push('error', t('s.pinWrong')); setBusyPin(false); return }
      setOldPin('')
      if (pinAction === 'remove') {
        stagePin('', 'remove')
      } else if (pinAction === 'change') {
        setPinStep('new')
      }
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      setBusyPin(false)
    }
  }

  // ---- background upload (staged) ----
  const bgFileRef = useRef<HTMLInputElement>(null)
  const uploadBg = async (file: File) => {
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onload = () => resolve(String(fr.result))
        fr.onerror = () => reject(new Error('read-error'))
        fr.readAsDataURL(file)
      })
      editLive('bg_image', dataUrl)
      toast.push('info', t('s.uploadStaged'))
    } catch {
      toast.push('error', t('common.error'))
    } finally {
      if (bgFileRef.current) bgFileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t('s.title')}</h1>
          <p className="text-sm text-muted">{t('s.sub')}</p>
        </div>
        <Button onClick={saveAll} disabled={!dirty} className="text-white" title={dirty ? t('s.saveBtn') : t('s.saved')}>
          {t('s.saveBtn')}
        </Button>
      </div>

      <div className="columns-1 md:columns-2 xl:columns-3 gap-5">

      <Card className="mb-5 break-inside-avoid">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4 text-accent" /> {t('s.themeCard')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('s.theme')}</div>
              <div className="text-xs text-muted">{t(THEME_LABELS[val('theme')] ?? 's.themeObsidian')}</div>
            </div>
            <Select value={String(val('theme'))} onChange={e => editLive('theme', e.target.value as Settings['theme'])} className="w-36">
              <option value="obsidian">{t('s.themeObsidian')}</option>
              <option value="aurora">{t('s.themeAurora')}</option>
              <option value="midnight">{t('s.themeMidnight')}</option>
              <option value="frosted-light">{t('s.themeFrosted')}</option>
              <option value="cyberpunk">{t('s.themeCyberpunk')}</option>
            </Select>
          </div>
          <Separator />
          <div>
            <div className="mb-2 text-sm font-medium">{t('s.palette')}</div>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENTS.map(a => (
                <button
                  key={a.key}
                  title={a.key}
                  onClick={() => editLive('accent', a.key)}
                  className={cn('h-8 w-8 rounded-full transition-transform', val('accent') === a.key && 'ring-2 ring-offset-2 ring-offset-background scale-110')}
                  style={{ background: a.color, '--tw-ring-color': a.color } as React.CSSProperties}
                />
              ))}
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('s.lang')}</div>
              <div className="text-xs text-muted">{val('lang') === 'fa' ? t('s.fa') : t('s.en')}</div>
            </div>
            <Select value={String(val('lang'))} onChange={e => editLive('lang', e.target.value as 'fa' | 'en')} className="w-32">
              <option value="fa">{t('s.fa')}</option>
              <option value="en">{t('s.en')}</option>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{t('s.glassIntensity')}</div>
              <div className="text-xs text-muted">{t('s.glassHint')}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="number text-xs text-muted w-10 text-center">{faNum(val('glass_intensity') * 100, 0)}٪</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={val('glass_intensity')}
                onChange={e => editLive('glass_intensity', Number(e.target.value))}
                className="w-40"
              />
            </div>
          </div>
          <Separator />
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium">{t('s.matteIntensity')}</div>
              <div className="text-xs text-muted">{t('s.matteHint')}</div>
            </div>
            <div className="flex items-center gap-3">
              <span className="number text-xs text-muted w-10 text-center">{faNum(val('matte_intensity') * 100, 0)}٪</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={val('matte_intensity')}
                onChange={e => editLive('matte_intensity', Number(e.target.value))}
                className="w-40"
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="text-sm font-medium">{t('s.cardAppearance')}</div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-muted">{t('s.cardBlur')}</div>
              <div className="flex items-center gap-3">
                <span className="number text-xs text-muted w-8 text-center">{faNum(val('card_blur') * 100, 0)}٪</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={val('card_blur')}
                  onChange={e => editLive('card_blur', Number(e.target.value))}
                  className="w-32"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-muted">{t('s.cardContrast')}</div>
              <div className="flex items-center gap-3">
                <span className="number text-xs text-muted w-8 text-center">{faNum(val('card_contrast') * 100, 0)}٪</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={val('card_contrast')}
                  onChange={e => editLive('card_contrast', Number(e.target.value))}
                  className="w-32"
                />
              </div>
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="text-sm font-medium">{t('s.bgCard')}</div>
            <div className="flex flex-wrap items-center gap-2">
              {BG_PRESET_KEYS.map(k => (
                <button
                  key={k}
                  onClick={() => editLive('bg_image', k)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-all',
                    String(val('bg_image')) === k
                      ? 'bg-accent/20 border-accent/50 text-accent'
                      : 'border-border text-muted hover:border-accent/40',
                  )}
                >
                  {t('s.bg.' + k)}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                dir="ltr"
                value={String(val('bg_image')).startsWith('http') ? String(val('bg_image')) : ''}
                onChange={e => editLive('bg_image', e.target.value.trim() || 'none')}
                placeholder={t('s.bgUrl')}
                className="h-9 flex-1 text-xs"
              />
              <input ref={bgFileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadBg(f) }} />
              <Button variant="outline" size="sm" onClick={() => bgFileRef.current?.click()}>
                <Upload className="h-3.5 w-3.5" /> {t('s.bgUpload')}
              </Button>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-muted">{t('s.bgBlur')}</div>
              <div className="flex items-center gap-3">
                <span className="number text-xs text-muted w-8 text-center">{faNum(val('bg_blur') * 100, 0)}٪</span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={val('bg_blur')}
                  onChange={e => editLive('bg_blur', Number(e.target.value))}
                  className="w-32"
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div className="text-xs text-muted">{t('s.bgBrightness')}</div>
              <div className="flex items-center gap-3">
                <span className="number text-xs text-muted w-10 text-center">{val('bg_brightness') > 0 ? '+' : ''}{faNum(val('bg_brightness'), 0)}</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={5}
                  value={val('bg_brightness')}
                  onChange={e => editLive('bg_brightness', Number(e.target.value))}
                  className="w-32"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5 break-inside-avoid">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /> {t('s.currencyCard')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('s.base')}</div>
              <div className="text-xs text-muted">{val('base_currency') === 'USD' ? t('s.usd') : t('s.irt')}</div>
            </div>
            <Select value={String(val('base_currency'))} onChange={e => edit('base_currency', e.target.value as 'USD' | 'IRT')} className="w-32">
              <option value="USD">{t('s.usd')}</option>
              <option value="IRT">{t('s.irt')}</option>
            </Select>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('s.second')}</div>
              <div className="text-xs text-muted">{t('s.secondHint')}</div>
            </div>
            <Switch checked={val('show_toman')} onChange={v => edit('show_toman', v)} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{t('s.defaultRange')}</div>
              <div className="text-xs text-muted">{String(val('default_range'))}</div>
            </div>
            <Select value={String(val('default_range'))} onChange={e => edit('default_range', e.target.value as Settings['default_range'])} className="w-32">
              <option value="day">{t('f.day')}</option>
              <option value="week">{t('f.week')}</option>
              <option value="month">{t('f.month')}</option>
              <option value="year">{t('f.year')}</option>
              <option value="all">{t('f.all')}</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-5 break-inside-avoid">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-accent" /> {t('s.securityCard')}</CardTitle>
          <CardDescription>{t('s.securityDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {settings.pin_set ? (
            <>
              <div className="flex items-center justify-between rounded-lg border border-positive/30 bg-positive/10 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-positive"><ShieldCheck className="h-4 w-4" /> {t('s.pinActive')}</span>
              </div>
              {pinDraft && (
                <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-1.5 text-xs text-accent">
                  {t('s.pinStaged')}
                </div>
              )}

              {pinAction === 'none' && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setPinAction('change'); setPinStep('old') }}>
                    <KeyRound className="h-3.5 w-3.5" /> {t('s.changePin')}
                  </Button>
                  <Button variant="danger" size="sm" className="flex-1" onClick={() => setPinAction('remove')}>
                    <Trash2 className="h-3.5 w-3.5" /> {t('s.removePin')}
                  </Button>
                </div>
              )}

              {(pinAction === 'remove' || (pinAction === 'change' && pinStep === 'old')) && (
                <div className="space-y-2">
                  <label className="block text-xs text-muted">{t('s.oldPin')}</label>
                  <Input type="password" dir="ltr" value={oldPin} onChange={e => setOldPin(e.target.value)} placeholder="••••" />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={confirmOldPin} loading={busyPin} disabled={!oldPin}>
                      {pinAction === 'remove' ? t('s.confirmRemove') : t('s.confirmOld')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPinAction('none')}>{t('common.cancel')}</Button>
                  </div>
                </div>
              )}

              {pinAction === 'change' && pinStep === 'new' && (
                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('s.newPin')}</label>
                      <Input type="password" dir="ltr" value={pin1} onChange={e => setPin1(e.target.value)} placeholder="••••" />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-muted">{t('s.confirmPin')}</label>
                      <Input type="password" dir="ltr" value={pin2} onChange={e => setPin2(e.target.value)} placeholder="••••" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={savePin} loading={savingPin}>{t('s.saveNewPin')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => { setPinAction('none'); setPinStep('old') }}>{t('common.cancel')}</Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs text-muted">{t('s.pin')}</label>
                  <Input type="password" dir="ltr" value={pin1} onChange={e => setPin1(e.target.value)} placeholder="••••" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-muted">{t('s.confirmPin')}</label>
                  <Input type="password" dir="ltr" value={pin2} onChange={e => setPin2(e.target.value)} placeholder="••••" />
                </div>
              </div>
              <Button onClick={savePin} loading={savingPin}>{t('s.setPin')}</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-5 break-inside-avoid">
        <CardHeader><CardTitle>{t('s.goalBudgetCard')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-muted">{t('s.goalBudgetWeekly')}</div>
            <Input
              dir="ltr"
              inputMode="numeric"
              value={String(val('goal_budget_weekly'))}
              onChange={e => editLive('goal_budget_weekly', Number(e.target.value.replace(/[^\d.]/g, '')) || 0)}
              className="h-9 w-32"
              placeholder="100"
            />
          </div>
          <p className="text-[11px] text-muted">{t('s.goalBudgetHint')}</p>
        </CardContent>
      </Card>

      <div className="mb-5 break-inside-avoid">
        <NewsWatchSettings
          watch={val('news_watch')}
          lead={val('news_lead_minutes')}
          onEdit={p => {
            if (p.news_watch) edit('news_watch', p.news_watch)
            if (p.news_lead_minutes) edit('news_lead_minutes', p.news_lead_minutes)
          }}
        />
      </div>

      <Card className="mb-5 break-inside-avoid">
        <CardHeader><CardTitle>{t('s.about')}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted">
          <p>FundTrack — Python backend + React dashboard</p>
          <p className="break-all">events.jsonl (MT5 EA)</p>
        </CardContent>
      </Card>
      </div>

      {showLeave && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-4 pt-6">
              <div className="text-base font-bold">{t('s.leaveTitle')}</div>
              <p className="text-sm text-muted">{t('s.leaveBody')}</p>
              <div className="flex gap-2">
                <Button className="flex-1" onClick={handleSaveLeave}>{t('s.confirmYes')}</Button>
                <Button variant="ghost" className="flex-1" onClick={() => setShowLeave(false)}>{t('s.confirmNo')}</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
