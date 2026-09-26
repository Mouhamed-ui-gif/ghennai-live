import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  error: Error | null
}

/** حدّ أخطاء يمنع انهيار التطبيق كاملًا ويعرض رسالة جميلة ثلاثية الأبعاد */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="grid min-h-screen place-items-center bg-night-950 p-6">
          <div className="glass-strong tilt-3d max-w-md rounded-3xl p-8 text-center">
            <p className="text-5xl">🛸</p>
            <h1 className="grad-text mt-3 text-2xl font-extrabold">حدث خطأ غير متوقع</h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400" dir="auto">
              {this.state.error.message || 'Unknown error'}
            </p>
            <button onClick={() => window.location.reload()} className="btn-primary mt-6 w-full">
              إعادة التحميل
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
