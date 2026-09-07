import { useEffect, useRef, useState } from 'react'

const GOOGLE_SCRIPT_ID = 'google-identity-services'
const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client'

interface GoogleCredentialResponse {
  credential?: string
}

interface GoogleButtonConfiguration {
  type: 'standard'
  theme: 'outline' | 'filled_black'
  size: 'large'
  text: 'signin_with' | 'signup_with'
  shape: 'rectangular'
  logo_alignment: 'left'
  width: number
}

interface GoogleIdentityApi {
  initialize(config: { client_id: string; callback: (response: GoogleCredentialResponse) => void }): void
  renderButton(parent: HTMLElement, config: GoogleButtonConfiguration): void
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentityApi } }
  }
}

export function GoogleSignInButton({
  mode,
  isId,
  onCredential,
  onError,
}: {
  mode: 'login' | 'register'
  isId: boolean
  onCredential: (credential: string) => void
  onError: (message: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const credentialHandlerRef = useRef(onCredential)
  const errorHandlerRef = useRef(onError)
  const initializedRef = useRef(false)
  const [ready, setReady] = useState(() => Boolean(window.google?.accounts.id))
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim()

  useEffect(() => { credentialHandlerRef.current = onCredential }, [onCredential])
  useEffect(() => { errorHandlerRef.current = onError }, [onError])

  useEffect(() => {
    if (window.google?.accounts.id) {
      setReady(true)
      return
    }

    let script = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null
    const handleLoad = () => setReady(true)
    const handleError = () => errorHandlerRef.current(isId ? 'Layanan Google tidak dapat dimuat.' : 'Google Sign-In could not be loaded.')

    if (!script) {
      script = document.createElement('script')
      script.id = GOOGLE_SCRIPT_ID
      script.src = GOOGLE_SCRIPT_URL
      script.async = true
      document.head.appendChild(script)
    }
    script.addEventListener('load', handleLoad)
    script.addEventListener('error', handleError)

    return () => {
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
    }
  }, [isId])

  useEffect(() => {
    if (!ready || !clientId || !window.google?.accounts.id || initializedRef.current) return
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (response.credential) credentialHandlerRef.current(response.credential)
        else errorHandlerRef.current(isId ? 'Google tidak mengirim kredensial.' : 'Google did not return a credential.')
      },
    })
    initializedRef.current = true
  }, [clientId, isId, ready])

  useEffect(() => {
    if (!ready || !clientId || !initializedRef.current || !containerRef.current || !window.google?.accounts.id) return

    const render = () => {
      const container = containerRef.current
      if (!container || !window.google?.accounts.id) return
      container.replaceChildren()
      window.google.accounts.id.renderButton(container, {
        type: 'standard',
        theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'filled_black' : 'outline',
        size: 'large',
        text: mode === 'register' ? 'signup_with' : 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width: Math.max(240, Math.floor(container.clientWidth)),
      })
    }

    render()
    window.addEventListener('resize', render)
    return () => window.removeEventListener('resize', render)
  }, [clientId, mode, ready])

  if (!clientId) {
    return <div className="login-google-unavailable" role="alert">{isId ? 'VITE_GOOGLE_CLIENT_ID belum diatur.' : 'VITE_GOOGLE_CLIENT_ID is not configured.'}</div>
  }

  return (
    <div className="login-google-frame" aria-label={mode === 'register' ? (isId ? 'Daftar dengan Google' : 'Sign up with Google') : (isId ? 'Masuk dengan Google' : 'Sign in with Google')}>
      {!ready && <span>{isId ? 'Memuat Google…' : 'Loading Google…'}</span>}
      <div ref={containerRef} />
    </div>
  )
}
