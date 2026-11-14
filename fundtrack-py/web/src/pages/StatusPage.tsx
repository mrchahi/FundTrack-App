import React from 'react'
import { RefreshCw } from 'lucide-react'
import { useAsync } from '../hooks'
import { api } from '../api'
import { useApp } from '../store'
import { useT } from '../lib/i18n'
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, PageHeader, Skeleton } from '../components/ui'
import { faNum } from '../lib/format'

export function StatusPage() {
  const { settings } = useApp()
  const t = useT(settings.lang)
  const { data, loading, refetch } = useAsync(() => api.status(), [])
  return (
    <div className="space-y-5">
      <PageHeader title={t('st.title')} subtitle={t('st.sub')} actions={
        <Button variant="ghost" size="icon" title={t('common.refresh')} onClick={refetch}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      } />

      {loading && !data ? <Skeleton className="h-64" /> : data && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                {t('st.connection')}
                <Badge tone={data.events_file_exists ? 'positive' : 'negative'}>
                  {data.events_file_exists ? t('st.active') : t('st.inactive')}
                </Badge>
              </CardTitle>
              <CardDescription className="break-all">{data.events_file}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted">{t('st.db')}: <span className="break-all text-foreground">{data.db_file}</span></p>
              {data.last_error && <p className="mt-2 text-sm text-negative">{t('st.lastError')}: {data.last_error}</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t('st.counts')}</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Object.entries(data.counts).map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-border bg-surface p-4 text-center">
                    <div className="text-2xl font-extrabold number">{faNum(Number(v))}</div>
                    <div className="mt-1 text-xs text-muted">{k}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
