type HapticFn = () => void

const noop: HapticFn = () => undefined

const wrap = (fn: () => Promise<void>): HapticFn => () => {
  void fn().catch(() => undefined)
}

let impact: ((style: string) => Promise<void>) | null = null
let notification: ((type: string) => Promise<void>) | null = null
let selection: (() => Promise<void>) | null = null

try {
  const Haptics = require('expo-haptics')
  impact = Haptics.impactAsync
  notification = Haptics.notificationAsync
  selection = Haptics.selectionAsync
} catch {
  // expo-haptics not available — all haptics silently no-op
}

export const hapticSend: HapticFn = impact ? wrap(() => impact!('light')) : noop
export const hapticButton: HapticFn = impact ? wrap(() => impact!('light')) : noop
export const hapticAttachment: HapticFn = impact ? wrap(() => impact!('light')) : noop
export const hapticRecord: HapticFn = impact ? wrap(() => impact!('medium')) : noop
export const hapticTranscribed: HapticFn = notification ? wrap(() => notification!('success')) : noop
export const hapticDelete: HapticFn = notification ? wrap(() => notification!('success')) : noop
export const hapticError: HapticFn = notification ? wrap(() => notification!('error')) : noop
export const hapticSelection: HapticFn = selection ? wrap(() => selection!()) : noop
