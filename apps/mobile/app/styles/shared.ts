import { StyleSheet } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants';

/**
 * Common styles used across multiple screens
 */
export const sharedStyles = StyleSheet.create({
  // Cards
  card: {
    backgroundColor: colors.bgSecondary,
    borderColor: colors.bgTertiary,
    borderRadius: borderRadius.xxxl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  centerContent: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },

  // Empty states
  emptyState: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xxxxl,
  },
  emptyStateSubtext: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    textAlign: 'center',
  },
  emptyStateText: {
    color: colors.white,
    fontSize: fontSize.xxxl,
    fontWeight: '600',
  },
  errorSubtext: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },

  // Error states
  errorText: {
    color: colors.error,
    fontSize: fontSize.xxl,
  },

  // Inputs
  input: {
    backgroundColor: colors.bgPrimary,
    borderColor: colors.bgTertiary,
    borderRadius: borderRadius.xxl,
    borderWidth: 1,
    color: colors.white,
    fontSize: fontSize.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputMultiline: {
    minHeight: 120,
    textAlignVertical: 'top',
  },

  // Headers
  kicker: {
    color: colors.accent,
    fontSize: fontSize.md,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Loading states
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'flex-end',
  },
  modalButton: {
    alignItems: 'center',
    borderRadius: borderRadius.xl,
    minWidth: 80,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.bgSecondary,
    borderRadius: spacing.xl,
    gap: spacing.xl,
    maxWidth: 500,
    padding: spacing.xxl,
    width: '100%',
  },

  // Modal styles
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxl,
  },
  modalTitle: {
    color: colors.white,
    fontSize: fontSize.h3,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: borderRadius.xxxl,
    paddingVertical: spacing.xxl - 10,
  },
  primaryButtonText: {
    color: colors.accentDark,
    fontSize: fontSize.xl,
    fontWeight: '600',
  },

  // Buttons
  retryButton: {
    backgroundColor: colors.bgTertiary,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
  },
  retryButtonText: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
  // Containers
  screenContainer: {
    backgroundColor: colors.bgPrimary,
    flex: 1,
  },
  screenContainerSecondary: {
    backgroundColor: colors.bgSecondary,
    flex: 1,
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: fontSize.xl,
    lineHeight: 22,
  },
  title: {
    color: colors.white,
    fontSize: fontSize.h1,
    fontWeight: '600',
  },
});

export type SharedStyles = typeof sharedStyles;
