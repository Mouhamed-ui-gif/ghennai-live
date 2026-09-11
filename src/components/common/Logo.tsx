interface LogoProps {
  size?: number
  withText?: boolean
  className?: string
  textClass?: string
  href?: boolean
}

export function BrainMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="drop-shadow-[0_0_14px_rgba(6,182,212,.5)]">
      <defs>
        <linearGradient id="glog" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#0a0e1c" />
      <rect x="2" y="2" width="60" height="60" rx="16" fill="none" stroke="url(#glog)" strokeWidth="1.5" />
      <path
        d="M32 14c-9 0-15 6.5-15 15 0 4.6 2 8.6 5.2 11.4-.9 2.6-2.4 5-4.2 7.2-.7.9.2 2.1 1.3 1.9 4.6-1 8.7-3.4 11.7-6.7.7.02 1.9.05 2.6.07 7-.5 12.7-6 14.4-12.6.6-2.3.9-4.7 1-7.2.3-3.7-1-7.4-3.7-10C42 16 37.5 14 32 14z"
        fill="none"
        stroke="url(#glog)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="28" r="2.6" fill="#06b6d4" />
      <circle cx="32" cy="24" r="2.6" fill="#8b5cf6" />
      <circle cx="40" cy="28" r="2.6" fill="#06b6d4" />
      <path d="M24 28h16" stroke="url(#glog)" strokeWidth="1.6" opacity=".6" />
    </svg>
  )
}

export function Logo({ size = 36, withText = true, className = '', textClass = '' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrainMark size={size} />
      {withText && (
        <span className={`text-xl font-extrabold tracking-tight ${textClass || 'grad-text'}`}>Ghennai</span>
      )}
    </span>
  )
}