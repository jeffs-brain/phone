import { LiquidGlassView, isLiquidGlassSupported } from '@callstack/liquid-glass'
import type { ReactNode } from 'react'
import {
  View,
  type ColorValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

import { styles } from './styles'

export type GlassSurfaceProps = {
  readonly children: ReactNode
  readonly style?: StyleProp<ViewStyle>
  readonly effect?: 'clear' | 'regular'
  readonly tintColor?: ColorValue
}

export function GlassSurface({
  children,
  style,
  effect = 'regular',
  tintColor = 'rgba(243, 239, 236, 0.72)',
}: GlassSurfaceProps) {
  const surfaceStyle = [
    styles.glassSurface,
    isLiquidGlassSupported ? styles.glassSurfaceNative : styles.glassSurfaceFallback,
    style,
  ]

  if (isLiquidGlassSupported) {
    return (
      <LiquidGlassView
        colorScheme="light"
        effect={effect}
        interactive
        style={surfaceStyle}
        tintColor={tintColor}
      >
        {children}
      </LiquidGlassView>
    )
  }

  return <View style={surfaceStyle}>{children}</View>
}
