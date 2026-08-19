import type { ReactElement } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { createScreenStatesStyles } from '@/components/ScreenStates.styles';
import { useMobileTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export { EmptyState } from '@/components/EmptyState';
export { ErrorScreen } from '@/components/ErrorScreen';

interface LoadingScreenProps {
  message?: string;
  color?: string;
}

export function LoadingScreen({
  message = 'Loading...',
  color,
}: LoadingScreenProps): ReactElement {
  const { colors } = useMobileTheme();
  const styles = useThemedStyles(createScreenStatesStyles);

  return (
    <View style={[styles.container, styles.centerContent]}>
      <ActivityIndicator size="large" color={color ?? colors.primary} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}
