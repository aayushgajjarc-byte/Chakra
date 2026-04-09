export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0B0F17',
        surface: '#111827',
        card: 'rgba(17, 24, 39, 0.75)',
        hover: '#1F2937',
        border: '#1F2937',
        'border-hover': 'rgba(0, 240, 255, 0.4)',
        primary: '#00F0FF',
        secondary: '#3B82F6',
        danger: '#EF4444',
        risk: '#EF4444',
        warning: '#F59E0B',
        success: '#22C55E',
        textPrimary: '#F9FAFB',
        textSecondary: '#9CA3AF',
        muted: '#6B7280',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      backdropBlur: {
        xs: '2px',
        xl: '12px',
      },
      boxShadow: {
        glow: '0 0 30px rgba(0, 240, 255, 0.15)',
        'glow-hover': '0 0 30px rgba(0, 240, 255, 0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
