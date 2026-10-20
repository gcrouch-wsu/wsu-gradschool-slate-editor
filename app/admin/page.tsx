'use client'

import Link from 'next/link'
import { useEffect, useState, type FormEvent } from 'react'

interface Account {
  id: string
  display_name: string
  email: string | null
  role: string
  active: boolean
}

export default function AdminAccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [error, setError] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'editor' | 'administrator'>('editor')

  async function load() {
    const response = await fetch('/api/admin/users')
    if (response.status === 401) {
      window.location.href = '/sign-in?next=/admin'
      return
    }
    if (response.status === 403) {
      setError('An administrator account is required.')
      return
    }
    if (!response.ok) {
      setError('Accounts are unavailable.')
      return
    }
    const body = (await response.json()) as { users: Account[] }
    setAccounts(body.users)
  }

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/users')
      .then(async (response) => {
        if (cancelled) return
        if (response.status === 401) {
          window.location.href = '/sign-in?next=/admin'
          return
        }
        if (response.status === 403) {
          setError('An administrator account is required.')
          return
        }
        if (!response.ok) {
          setError('Accounts are unavailable.')
          return
        }
        const body = (await response.json()) as { users: Account[] }
        if (!cancelled) setAccounts(body.users)
      })
      .catch(() => {
        if (!cancelled) setError('Accounts are unavailable.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function createAccount(event: FormEvent) {
    event.preventDefault()
    setError('')
    const response = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName, email, password, role }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string }
      setError(body.error || 'The account could not be created.')
      return
    }
    setDisplayName('')
    setEmail('')
    setPassword('')
    await load()
  }

  return (
    <main className="max-w-3xl mx-auto p-6">
      <Link className="text-sm text-wsu-crimson" href="/newsletters">Back to newsletters</Link>
      <h1 className="text-2xl font-semibold my-4">Editor accounts</h1>
      {error && <p className="mb-4 text-red-700">{error}</p>}
      <form className="space-y-3 mb-8" onSubmit={(event) => void createAccount(event)}>
        <label className="block text-sm" htmlFor="displayName">Name</label>
        <input id="displayName" className="border rounded px-3 py-2 w-full" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
        <label className="block text-sm" htmlFor="accountEmail">Email</label>
        <input id="accountEmail" type="email" className="border rounded px-3 py-2 w-full" value={email} onChange={(event) => setEmail(event.target.value)} required />
        <label className="block text-sm" htmlFor="accountPassword">Password</label>
        <input id="accountPassword" type="password" className="border rounded px-3 py-2 w-full" value={password} onChange={(event) => setPassword(event.target.value)} required />
        <label className="block text-sm" htmlFor="accountRole">Role</label>
        <select id="accountRole" className="border rounded px-3 py-2 w-full" value={role} onChange={(event) => setRole(event.target.value === 'administrator' ? 'administrator' : 'editor')}>
          <option value="editor">Editor</option>
          <option value="administrator">Administrator</option>
        </select>
        <button className="bg-wsu-crimson text-white px-4 py-2 rounded" type="submit">Create account</button>
      </form>
      <ul className="space-y-2">
        {accounts.map((account) => (
          <li key={account.id} className="border rounded p-3">
            <span className="font-medium">{account.display_name}</span>
            <span className="text-sm text-wsu-text-muted"> · {account.email} · {account.role} · {account.active ? 'active' : 'inactive'}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
