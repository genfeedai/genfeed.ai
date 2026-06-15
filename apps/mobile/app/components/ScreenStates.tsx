import type { ReactElement } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { screenStatesStyles as styles } from '@/components/ScreenStates.styles';
import { colors } from '@/constants';

export { EmptyState } from '@/components/EmptyState';
export { ErrorScreen } from '@/components/ErrorScreen';

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
