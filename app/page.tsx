import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// The newsletter library sends signed-out visitors to sign-in.
export default function HomePage() {
  redirect('/newsletters')
}
