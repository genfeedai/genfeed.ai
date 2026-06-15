import { StyleSheet } from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants';

export const screenStatesStyles = StyleSheet.create({
  centerContent: {
    alignItems: 'center',
    gap: spacing.lg,
    justifyContent: 'center',
  },
  container: {
    backgroundColor: colors.bgPrimary,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
    padding: spacing.xxxxl,
  },
  emptyStateEmoji: {
    fontSize: 48,
  },
  emptyStateSubtext: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
    textAlign: 'center',
  },
  emptyStateText: {
    color: colors.white,
    fontSize: fontSize.h3,
    fontWeight: '600',
  },
  errorSubtext: {
    color: colors.textMuted,
    fontSize: fontSize.lg,
  },
  errorText: {
    color: colors.error,
    fontSize: fontSize.xxl,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
  },
  retryButton: {
    backgroundColor: colors.bgTertiary,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    color: colors.accent,
    fontSize: fontSize.lg,
    fontWeight: '500',
  },
});
