/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/src/main/assets/**/*.html",
    "./app/src/main/assets/**/*.js"
  ],
  theme: {
    fontFamily: {
      sans: ['"IBM Plex Sans"', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'monospace'],
    },
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#FFFFFF',
      navy: '#173541',
      ink: {
        DEFAULT: '#173541',
        muted: '#52707A',
      },
      brand: '#4A6F79',
      tint: '#85ADBB',
      bg: '#FAFAF8',
      surface: '#FFFFFF',
      line: '#E3E8E8',
      danger: {
        DEFAULT: '#B02A34',
        bg: '#FBE6E7',
        hero: '#FF8A8F',
      },
      warn: {
        DEFAULT: '#8A5F0A',
        bg: '#FBF1DC',
        hero: '#E8B04A',
      },
      ok: {
        DEFAULT: '#256B4C',
        bg: '#E4F2EB',
        hero: '#5FC79A',
      },
    },
    borderRadius: {
      DEFAULT: '4px',
      none: '0px',
      sm: '4px',
      md: '4px',
      lg: '4px',
      xl: '4px',
      '2xl': '4px',
      '3xl': '4px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      DEFAULT: 'none',
      sm: 'none',
      md: 'none',
      lg: 'none',
      xl: 'none',
      '2xl': 'none',
    },
    fontSize: {
      xs: ['12px', '16px'],
      sm: ['14px', '20px'],
      base: ['16px', '24px'],
      display: ['32px', '40px'],
    },
    fontWeight: {
      normal: '400',
      semibold: '600',
    },
    extend: {
      spacing: {
        '1': '4px',
        '2': '8px',
        '3': '12px',
        '4': '16px',
        '5': '20px',
        '6': '24px',
        '8': '32px',
        '10': '40px',
        '11': '44px',
        '12': '48px',
        '16': '64px',
      },
      minHeight: {
        'touch': '44px',
      },
      minWidth: {
        'touch': '44px',
      },
    },
  },
  plugins: [],
}
