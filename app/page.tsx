import { redirect } from 'next/navigation'
import EditorPage from './editor-page'
import { authMode } from '@/lib/runtime-config'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  const mode = authMode()
  if (mode === 'local' || mode === 'okta') redirect('/newsletters')
  return <EditorPage />
}
