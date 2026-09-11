/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        night: {
          950: '#060913',
          900: '#0a0e1c',
          850: '#0f1526',
          800: '#121a2f',
          700: '#1b2440',
        },
        brand: {
          cyan: '#06b6d4',
          violet: '#8b5cf6',
          rose: '#f43f5e',
        },
      },
      fontFamily: {
        arabic: ['Tajawal', 'system-ui', 'sans-serif'],
        latin: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-up': 'fadeUp .7s cubic-bezier(.16,1,.3,1) both',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        marquee: 'marquee 40s linear infinite',
        aurora: 'aurora 12s ease-in-out infinite',
        blink: 'blink 1s step-end infinite',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        glowPulse: {
          '0%,100%': { boxShadow: '0 0 20px rgba(6,182,212,.35), 0 0 40px rgba(139,92,246,.2)' },
          '50%': { boxShadow: '0 0 34px rgba(6,182,212,.6), 0 0 70px rgba(139,92,246,.35)' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        aurora: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        blink: {
          '0%,100%': { opacity: '1' },
          '50%': { opacity: '0' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
}