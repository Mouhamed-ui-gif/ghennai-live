const CLIENT_ID: string = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || ''

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      if (typeof window !== 'undefined' && (window as unknown as { google?: object }).google) {
        resolve()
        return
      }
      const s = document.createElement('script')
      s.src = 'https://accounts.google.com/gsi/client'
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error('failed to load google script'))
      document.head.appendChild(s)
    })
  }
  return scriptPromise
}

export { CLIENT_ID, loadScript }

export async function renderGoogleButton(el: HTMLDivElement, cb: (idToken: string) => void) {
  const g = (window as unknown as { google?: { accounts?: { id?: { initialize: (p: object) => void; renderButton: (el: HTMLElement, opt: object) => void } } } }).google
  if (!g?.accounts?.id) return false
  g.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp: { credential?: string }) => resp?.credential && cb(resp.credential),
    auto_select: true,
  })
  g.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'outline',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left',
    width: 320,
  })
  return true
}