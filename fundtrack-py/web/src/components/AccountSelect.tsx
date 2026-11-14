import React from 'react'
import { useApp } from '../store'
import { Select } from './ui'

export function AccountSelect({ className }: { className?: string }) {
  const { accounts, activeLogin, setActiveLogin } = useApp()
  return (
    <Select
      value={activeLogin?.toString() ?? ''}
      onChange={e => setActiveLogin(e.target.value ? Number(e.target.value) : null)}
      className={className}
      title="انتخاب حساب"
    >
      <option value="">همه حساب‌ها</option>
      {accounts.filter(a => !a.archived).map(a => (
        <option key={a.login} value={a.login}>{a.name || a.login}</option>
      ))}
    </Select>
  )
}
