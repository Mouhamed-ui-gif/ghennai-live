import { Component, type ReactNode } from 'react'

interface State {
  error: string | null
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(err: unknown): State {
    return { error: String((err as Error)?.message || err) }
  }

  componentDidCatch(err: unknown) {
    console.error('[Ghennai-UI]', err)
  }

  render() {
    if (this.state.error) {
      return (
        <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#060913] p-6 text-center">
          <p className="text-5xl">⚠️</p>
          <h1 className="text-xl font-bold text-white">حدث خطأ غير متوقع في الواجهة</h1>
          <p className="max-w-md break-words rounded-2xl bg-rose-500/10 p-4 font-mono text-sm text-rose-300" dir="ltr">
            {this.state.error}
          </p>
          <button
            onClick={() => this.setState({ error: null })}
            className="rounded-2xl bg-gradient-to-l from-cyan-500 to-violet-500 px-6 py-2.5 font-bold text-white"
          >
            إعادة المحاولة
          </button>
        </div>
      )
    }
    return this.props.children
  }
}