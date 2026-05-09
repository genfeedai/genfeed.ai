import { Stack } from 'expo-router';
import { colors } from '@/constants';

export default function LegalLayout() {
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
