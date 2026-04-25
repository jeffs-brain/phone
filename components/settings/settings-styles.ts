import { StyleSheet } from 'react-native'

import { colors, radius, shadows } from '../../lib/theme'

export const settingsStyles = StyleSheet.create({
  root: {
    backgroundColor: colors.bg.grouped,
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  headerCopy: {
    flex: 1,
    paddingRight: 14,
  },
  title: {
    color: colors.text.primary,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0,
  },
  doneButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  doneText: {
    color: colors.accent.teal,
    fontSize: 17,
    fontWeight: '600',
  },
  section: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    gap: 12,
    marginBottom: 16,
    paddingHorizontal: 20,
    paddingVertical: 20,
    ...shadows[1],
  },
  sectionTitle: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 2,
  },
  optionButton: {
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  selectedOption: {
    backgroundColor: colors.button.selected.bg,
    borderColor: colors.button.selected.border,
  },
  optionLabel: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  selectedOptionText: {
    color: colors.accent.teal,
  },
  optionDetail: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  selectedOptionDetail: {
    color: colors.accent.teal,
  },
  summaryPanel: {
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 12,
  },
  summaryCopy: {
    gap: 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: radius.sm,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: {
    color: colors.text.onAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  mutedButton: {
    backgroundColor: colors.bg.secondary,
  },
  disabledButton: {
    opacity: 0.52,
  },
  mutedActionText: {
    color: colors.text.primary,
  },
  disabledText: {
    color: colors.text.secondary,
  },
  errorText: {
    color: colors.accent.error,
    fontSize: 13,
    lineHeight: 18,
  },
  segmented: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.md,
    flexDirection: 'row',
    padding: 4,
  },
  segment: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  selectedSegment: {
    backgroundColor: colors.accent.teal,
  },
  segmentText: {
    color: colors.text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  selectedSegmentText: {
    color: colors.text.onAccent,
  },
  toggleRow: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  toggleCopy: {
    flex: 1,
    paddingRight: 12,
  },
  diagnosticRow: {
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  diagnosticLabel: {
    color: colors.text.secondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  diagnosticValue: {
    color: colors.text.primary,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 4,
  },
  diagnosticDetail: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 3,
  },
  diagnosticNote: {
    color: colors.text.secondary,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
  },
})
