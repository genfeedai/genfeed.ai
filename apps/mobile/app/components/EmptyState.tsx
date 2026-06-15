import type { ReactElement } from 'react';
import { Text, View } from 'react-native';
import { screenStatesStyles as styles } from '@/components/ScreenStates.styles';

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

export default EmptyState;
