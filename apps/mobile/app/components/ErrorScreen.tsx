import type { ReactElement } from 'react';
import { Pressable, Text, View } from 'react-native';
import { screenStatesStyles as styles } from '@/components/ScreenStates.styles';

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

export default ErrorScreen;
