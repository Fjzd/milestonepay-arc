import { RouterProvider, useRouter } from './components/Router'
import { Header } from './components/Header'
import { Footer } from './components/Footer'
import { Dashboard } from './components/Dashboard'
import { CreateEscrow } from './components/CreateEscrow'
import { EscrowDetail } from './components/EscrowDetail'
import { PayLink } from './components/PayLink'
import { PayEntry } from './components/PayEntry'
import { Profile } from './components/Profile'
import { DeployMainnet } from './components/DeployMainnet'

// Pages that render without the main header
const HEADERLESS = new Set(['/pay/:id', '/deploy'])
// Pages that render without the footer (pay-link is embedded; deploy has its own layout)
const FOOTERLESS = new Set(['/pay/:id', '/deploy'])

function AppContent() {
  const { path, params } = useRouter()

  let page = '/'
  if (path === '/create') page = '/create'
  if (path === '/escrow/:id') page = '/escrow/:id'
  if (path === '/pay/:id') page = '/pay/:id'
  if (path === '/pay') page = '/pay'
  if (path === '/profile' || path === '/profile/:address') page = '/profile'
  if (path === '/deploy') page = '/deploy'

  return (
    <div className="min-h-dvh flex flex-col" style={{ background: 'var(--bg-gradient)' }}>
      {!HEADERLESS.has(path) && <Header page={page === '/escrow/:id' ? '/' : page === '/create' ? '/create' : page === '/pay' ? '/pay' : page} />}

      <main className="flex-1">
        {path === '/' && <Dashboard />}
        {path === '/create' && <CreateEscrow />}
        {path === '/escrow/:id' && <EscrowDetail id={params.id} />}
        {path === '/pay/:id' && <PayLink id={params.id} />}
        {path === '/pay' && <PayEntry />}
        {path === '/profile' && <Profile />}
        {path === '/profile/:address' && <Profile targetAddress={params.address} />}
        {path === '/deploy' && <DeployMainnet />}
      </main>

      {!FOOTERLESS.has(path) && <Footer />}
    </div>
  )
}

export default function App() {
  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  )
}
