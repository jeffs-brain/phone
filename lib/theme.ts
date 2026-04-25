import type { TextStyle, ViewStyle } from 'react-native'

export const colors = {
  bg: {
    root: '#FAF7F5',
    card: '#FFFFFF',
    glass: '#F3EFEC',
    secondary: '#EDE8E4',
    grouped: '#F2F2F7',
  },
  text: {
    primary: '#1A1A1A',
    secondary: '#5C5650',
    muted: '#9B9490',
    onAccent: '#FFFFFF',
    onAccentLight: '#0E4F47',
  },
  accent: {
    teal: '#12B89E',
    tealPressed: '#0E9C86',
    coral: '#F2785C',
    success: '#2ECC87',
    warning: '#F0A93A',
    error: '#E8544E',
  },
  bubble: {
    user: { bg: '#12B89E', text: '#FFFFFF' },
    assistant: { bg: '#F3EFEC', text: '#1A1A1A', border: '#E2DCD7' },
    tool: { bg: '#FFF4E6', text: '#5C5650', border: '#F0D9B5' },
    system: { bg: '#EDE8E4', text: '#9B9490' },
  },
  button: {
    primary: { bg: '#12B89E', text: '#FFFFFF' },
    primaryPressed: { bg: '#0E9C86', text: '#FFFFFF' },
    secondary: { bg: '#F3EFEC', text: '#12B89E', border: '#D4CEC9' },
    ghost: { bg: 'rgba(0,0,0,0.04)', text: '#5C5650' },
    disabled: { bg: '#EDE8E4', text: '#9B9490' },
    destructive: { bg: '#FDEEED', text: '#E8544E' },
    selected: { bg: '#E6F9F5', text: '#0E4F47', border: '#12B89E' },
  },
  divider: '#E2DCD7',
  inputBorder: '#D4CEC9',
  inputFocus: '#12B89E',
} as const

export const radius = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  pill: 999,
} as const

export const shadows: Record<0 | 1 | 2 | 3, ViewStyle> = {
  0: {},
  1: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  2: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  3: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
} as const

export const spacing = (n: number): number => n * 4

export const typography: Record<string, TextStyle> = {
  display: { fontSize: 34, fontWeight: '700', lineHeight: 40, letterSpacing: -0.5 },
  heading: { fontSize: 22, fontWeight: '700', lineHeight: 28, letterSpacing: -0.3 },
  subheading: { fontSize: 17, fontWeight: '600', lineHeight: 22, letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  eyebrow: { fontSize: 11, fontWeight: '700', lineHeight: 14, letterSpacing: 0.8, textTransform: 'uppercase' },
  micro: { fontSize: 10, fontWeight: '600', lineHeight: 13, letterSpacing: 0.5 },
} as const
