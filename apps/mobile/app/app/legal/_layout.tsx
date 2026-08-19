import { Stack } from 'expo-router';
import { useMobileTheme } from '@/contexts/theme-context';

export default function LegalLayout() {
  const { colors } = useMobileTheme();

  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.bgPrimary },
        headerStyle: { backgroundColor: colors.bgSecondary },
        headerTintColor: colors.textPrimary,
      }}
    />
  );
}
