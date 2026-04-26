import { Platform, StyleSheet } from 'react-native'

import { colors, radius, shadows, spacing, typography } from '../../lib/theme'

export const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.root,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  titleGroup: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    ...typography.display,
    color: colors.text.primary,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  headerIconButton: {
    alignItems: 'center',
    backgroundColor: colors.button.ghost.bg,
    borderRadius: radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerIconText: {
    fontSize: 18,
  },
  disabledHeaderButton: {
    opacity: 0.52,
  },
  pressed: {
    opacity: 0.72,
  },
  glassSurface: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  glassSurfaceNative: {
    backgroundColor: 'transparent',
  },
  glassSurfaceFallback: {
    backgroundColor: colors.bg.glass,
  },
  statusPill: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing(2),
    paddingHorizontal: 10,
    paddingVertical: 5,
    ...shadows[1],
  },
  statusDot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusPillLabel: {
    ...typography.caption,
    color: colors.text.primary,
    flexShrink: 1,
  },
  statusErrorActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
  },
  statusErrorText: {
    color: colors.accent.error,
    flexBasis: '100%',
    ...typography.caption,
  },
  statusActionButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  secondaryStatusActionButton: {
    backgroundColor: colors.bg.secondary,
  },
  statusActionText: {
    color: colors.text.onAccent,
    ...typography.bodyBold,
  },
  secondaryStatusActionText: {
    color: colors.text.primary,
    ...typography.bodyBold,
  },
  messagesContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  messageListWrap: {
    flex: 1,
    position: 'relative',
  },
  messageList: {
    flex: 1,
  },
  latestMessageButton: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.pill,
    borderWidth: 1,
    bottom: 12,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 20,
    zIndex: 1,
    ...shadows[2],
  },
  latestMessageButtonText: {
    color: colors.accent.teal,
    ...typography.caption,
    fontWeight: '700',
  },
  messagesContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    alignSelf: 'center',
    maxWidth: 320,
    paddingVertical: 48,
  },
  emptyAvatar: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    marginBottom: spacing(4),
    width: 64,
  },
  emptyAvatarText: {
    color: colors.text.onAccent,
    fontSize: 28,
    fontWeight: '700',
  },
  emptyTitle: {
    ...typography.heading,
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptyCopy: {
    ...typography.body,
    color: colors.text.secondary,
    marginTop: spacing(2),
    textAlign: 'center',
  },
  suggestionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(2),
    justifyContent: 'center',
    marginTop: spacing(5),
  },
  suggestionChip: {
    backgroundColor: colors.button.secondary.bg,
    borderColor: colors.button.secondary.border,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  suggestionChipText: {
    ...typography.caption,
    color: colors.accent.teal,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  messageRowUser: {
    justifyContent: 'flex-end',
  },
  messageRowAssistant: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    borderRadius: radius.lg,
    maxWidth: '86%',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: colors.bubble.user.bg,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    backgroundColor: colors.bubble.assistant.bg,
    borderBottomLeftRadius: 6,
  },
  toolBubble: {
    backgroundColor: colors.bubble.tool.bg,
    borderColor: colors.bubble.tool.border,
    borderWidth: 1,
  },
  systemBubble: {
    backgroundColor: colors.bubble.system.bg,
  },
  messageMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 5,
  },
  messageMetaActions: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 8,
  },
  messageRoute: {
    color: colors.accent.warning,
    flexShrink: 1,
    ...typography.micro,
  },
  speechButton: {
    alignItems: 'center',
    backgroundColor: colors.button.ghost.bg,
    borderRadius: radius.sm,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 36,
    paddingHorizontal: 6,
  },
  speechButtonActive: {
    backgroundColor: colors.button.destructive.bg,
  },
  speechButtonDisabled: {
    opacity: 0.5,
  },
  speechButtonText: {
    fontSize: 14,
  },
  speechButtonTextActive: {
    fontSize: 14,
  },
  speechButtonTextDisabled: {
    opacity: 0.5,
  },
  messageText: {
    ...typography.body,
    color: colors.bubble.assistant.text,
  },
  markdownBlockSpacing: {
    marginTop: 8,
  },
  markdownHeading: {
    fontWeight: '700',
  },
  markdownStrong: {
    fontWeight: '700',
  },
  markdownEmphasis: {
    fontStyle: 'italic',
  },
  markdownCode: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.xs,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    fontSize: 14,
    paddingHorizontal: 3,
  },
  markdownList: {
    gap: 4,
  },
  markdownListItem: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  markdownListMarker: {
    flexShrink: 0,
    minWidth: 20,
    paddingRight: 6,
    textAlign: 'right',
  },
  markdownListText: {
    flex: 1,
  },
  toolCallStrip: {
    gap: 5,
    marginBottom: 8,
  },
  toolCallRow: {
    alignItems: 'flex-start',
    gap: 3,
  },
  toolCallText: {
    alignSelf: 'flex-start',
    backgroundColor: '#E6F9F5',
    borderRadius: radius.xs,
    color: colors.text.onAccentLight,
    ...typography.micro,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  toolCallDetailText: {
    color: colors.text.secondary,
    ...typography.micro,
    paddingHorizontal: 2,
  },
  messageImageSingle: {
    marginBottom: 8,
  },
  messageImageFull: {
    aspectRatio: 4 / 3,
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    width: '100%',
  },
  messageImageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  messageImageThumb: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    height: 140,
    width: 140,
  },
  fileAttachmentList: {
    gap: 6,
    marginBottom: 8,
  },
  fileAttachment: {
    alignItems: 'center',
    backgroundColor: colors.bg.card,
    borderColor: colors.divider,
    borderRadius: radius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 46,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileAttachmentIcon: {
    fontSize: 16,
  },
  fileAttachmentTextGroup: {
    flex: 1,
  },
  fileAttachmentName: {
    color: colors.text.primary,
    ...typography.caption,
    fontWeight: '700',
  },
  fileAttachmentMeta: {
    color: colors.text.secondary,
    ...typography.micro,
    marginTop: 2,
  },
  userMessageText: {
    color: colors.bubble.user.text,
  },
  routeDetail: {
    color: colors.text.secondary,
    ...typography.micro,
    marginTop: 7,
  },
  thinkingPanel: {
    backgroundColor: colors.bg.secondary,
    borderRadius: radius.sm,
    marginBottom: 8,
    overflow: 'hidden',
  },
  thinkingToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  thinkingToggleStatic: {
    opacity: 0.8,
  },
  thinkingStatus: {
    color: colors.text.secondary,
    flex: 1,
    ...typography.caption,
    fontWeight: '600',
  },
  thinkingToggleText: {
    color: colors.accent.teal,
    fontSize: 12,
    fontWeight: '600',
  },
  thinkingText: {
    borderColor: colors.divider,
    borderTopWidth: 1,
    color: colors.text.secondary,
    ...typography.caption,
    lineHeight: 19,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  composerWrap: {
    borderColor: colors.divider,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  errorText: {
    color: colors.accent.error,
    ...typography.caption,
    marginBottom: 8,
    paddingHorizontal: 6,
  },
  stagedTray: {
    marginBottom: 8,
    gap: 8,
  },
  stagedScrollerContent: {
    gap: 10,
    paddingHorizontal: 4,
  },
  clearAllButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  clearAllText: {
    color: colors.accent.error,
    ...typography.caption,
    fontWeight: '600',
  },
  stagedAttachment: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    overflow: 'hidden',
    position: 'relative',
    width: 160,
    ...shadows[1],
  },
  stagedImage: {
    backgroundColor: colors.bg.secondary,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    height: 120,
    width: '100%',
  },
  stagedImageLabelRow: {
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stagedFilePreview: {
    alignItems: 'center',
    backgroundColor: colors.bg.secondary,
    gap: 6,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 20,
    width: '100%',
  },
  stagedFileIcon: {
    fontSize: 28,
  },
  stagedFileName: {
    color: colors.text.secondary,
    ...typography.caption,
    fontWeight: '600',
    textAlign: 'center',
  },
  stagedAttachmentLabel: {
    color: colors.text.secondary,
    ...typography.micro,
  },
  stagedRemoveButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 6,
    top: 6,
    width: 24,
  },
  stagedRemoveText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginTop: -1,
  },
  composer: {
    gap: 8,
    minHeight: 56,
    padding: 8,
    ...shadows[2],
  },
  composerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  attachmentActions: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  attachmentButton: {
    alignItems: 'center',
    backgroundColor: colors.button.ghost.bg,
    borderRadius: radius.sm,
    height: 44,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 10,
  },
  attachmentButtonText: {
    fontSize: 18,
  },
  disabledAttachmentButton: {
    backgroundColor: colors.button.disabled.bg,
    opacity: 0.58,
  },
  disabledAttachmentButtonText: {
    opacity: 0.5,
  },
  voiceActiveButton: {
    backgroundColor: colors.button.selected.bg,
  },
  voiceActiveButtonText: {
    fontSize: 18,
  },
  voiceTray: {
    backgroundColor: colors.bg.card,
    borderRadius: radius.md,
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...shadows[1],
  },
  voiceTrayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  voiceTrayLabel: {
    color: colors.text.primary,
    ...typography.bodyBold,
  },
  voiceTrayMeta: {
    color: colors.accent.teal,
    ...typography.caption,
    fontWeight: '600',
  },
  voiceTranscript: {
    color: colors.text.primary,
    ...typography.body,
  },
  voiceError: {
    color: colors.accent.error,
    ...typography.caption,
    lineHeight: 18,
  },
  input: {
    color: colors.text.primary,
    fontSize: 16,
    lineHeight: 21,
    maxHeight: 104,
    minHeight: 44,
    paddingBottom: 8,
    paddingHorizontal: 8,
    paddingTop: Platform.OS === 'ios' ? 10 : 7,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.teal,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    flexShrink: 0,
  },
  sendButtonText: {
    fontSize: 18,
  },
  disabledSendButton: {
    backgroundColor: colors.button.disabled.bg,
  },
  disabledSendButtonText: {
    opacity: 0.5,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: colors.accent.coral,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
    flexShrink: 0,
  },
  cancelButtonText: {
    fontSize: 18,
  },
})
