import type { ReactElement } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { borderRadius, colors, fontSize, spacing } from '@/constants';

interface LoadingScreenProps {
  message?: string;
  color?: string;
}

export function LoadingScreen({
  message = 'Loading...',
  color = colors.accent,
}: LoadingScreenProps): ReactElement {
  return (
    <View style={[styles.container, styles.centerContent]}>
      <ActivityIndicator size="large" color={color} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

interface ErrorScreenProps {
  message?: string;
  subMessage?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorScreen({
  message = 'Something went wrong',
  subMessage,
  onRetry,
  retryLabel = 'Try Again',
}: ErrorScreenProps): ReactElement {
  return (
    <View style={[styles.container, styles.centerContent]}>
      <Text style={styles.errorText}>{message}</Text>
      {subMessage && <Text style={styles.errorSubtext}>{subMessage}</Text>}
      {onRetry && (
        <Pressable
          style={({ pressed }) => [
            styles.retryButton,
            pressed && styles.retryButtonPressed,
          ]}
          onPress={onRetry}
        >
          <Text style={styles.retryButtonText}>{retryLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

interface EmptyStateProps {
  title: string;
  message?: string;
  emoji?: string;
}

export function EmptyState({
  title,
  message,
  emoji,
}: EmptyStateProps): ReactElement {
  return (
    <View style={styles.emptyState}>
      {emoji && <Text style={styles.emptyStateEmoji}>{emoji}</Text>}
      <Text style={styles.emptyStateText}>{title}</Text>
      {message && <Text style={styles.emptyStateSubtext}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
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
