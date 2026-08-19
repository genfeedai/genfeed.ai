import type { ReactElement } from 'react';
import { Text, View } from 'react-native';
import { createScreenStatesStyles } from '@/components/ScreenStates.styles';
import { useThemedStyles } from '@/hooks/use-themed-styles';

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
  const styles = useThemedStyles(createScreenStatesStyles);

  return (
    <View style={styles.emptyState}>
      {emoji && <Text style={styles.emptyStateEmoji}>{emoji}</Text>}
      <Text style={styles.emptyStateText}>{title}</Text>
      {message && <Text style={styles.emptyStateSubtext}>{message}</Text>}
    </View>
  );
}

export default EmptyState;
