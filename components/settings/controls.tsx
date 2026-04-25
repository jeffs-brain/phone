import type { ReactNode } from 'react'
import { Pressable, Switch, Text, View } from 'react-native'

import { colors } from '../../lib/theme'
import type { SettingsOption } from '../../lib/settings/copy'
import { settingsStyles as styles } from './settings-styles'

const SWITCH_TRACK_COLOUR = {
  false: colors.bg.secondary,
  true: colors.accent.teal,
} as const

export type SegmentOption<T extends string> = {
  readonly value: T
  readonly label: string
}

export function SettingsHeader({ onDone }: { readonly onDone: () => void }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.title}>Settings</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={onDone}
        style={({ pressed }) => [styles.doneButton, pressed ? styles.pressed : null]}
      >
        <Text style={styles.doneText}>✓ Done</Text>
      </Pressable>
    </View>
  )
}

export function SettingsSection({
  title,
  children,
}: {
  readonly title: string
  readonly children: ReactNode
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  )
}

export function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
}: {
  readonly label: string
  readonly detail: string
  readonly value: boolean
  readonly onValueChange: (value: boolean) => void
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={SWITCH_TRACK_COLOUR} />
    </View>
  )
}

export function DiagnosticRow({
  label,
  value,
  detail,
}: {
  readonly label: string
  readonly value: string
  readonly detail?: string
}) {
  return (
    <View style={styles.diagnosticRow}>
      <Text style={styles.diagnosticLabel}>{label}</Text>
      <Text style={styles.diagnosticValue}>{value}</Text>
      {detail === undefined ? null : <Text style={styles.diagnosticDetail}>{detail}</Text>}
    </View>
  )
}

export function ActionButton({
  label,
  onPress,
  muted = false,
  disabled = false,
}: {
  readonly label: string
  readonly onPress: () => void
  readonly muted?: boolean
  readonly disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        muted ? styles.mutedButton : null,
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.actionText, muted ? styles.mutedActionText : null, disabled ? styles.disabledText : null]}>
        {label}
      </Text>
    </Pressable>
  )
}

export function OptionButton<T extends string>({
  label,
  detail,
  value,
  selected,
  onSelect,
  disabled = false,
}: SettingsOption<T> & {
  readonly selected: boolean
  readonly onSelect: (value: T) => void
  readonly disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={() => onSelect(value)}
      style={({ pressed }) => [
        styles.optionButton,
        selected ? styles.selectedOption : null,
        disabled ? styles.disabledButton : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.optionLabel, selected ? styles.selectedOptionText : null, disabled ? styles.disabledText : null]}>
        {label}
      </Text>
      <Text style={[styles.optionDetail, selected ? styles.selectedOptionDetail : null, disabled ? styles.disabledText : null]}>
        {detail}
      </Text>
    </Pressable>
  )
}

export function SegmentedControl<T extends string>({
  options,
  selectedValue,
  onSelect,
}: {
  readonly options: readonly SegmentOption<T>[]
  readonly selectedValue: T
  readonly onSelect: (value: T) => void
}) {
  return (
    <View style={styles.segmented}>
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          onPress={() => onSelect(option.value)}
          style={[styles.segment, selectedValue === option.value ? styles.selectedSegment : null]}
        >
          <Text style={[styles.segmentText, selectedValue === option.value ? styles.selectedSegmentText : null]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  )
}

export function SummaryPanel({
  label,
  detail,
}: {
  readonly label: string
  readonly detail: string
}) {
  return (
    <View style={styles.summaryPanel}>
      <View style={styles.summaryCopy}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.optionDetail}>{detail}</Text>
      </View>
    </View>
  )
}
