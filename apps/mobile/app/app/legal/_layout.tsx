import { Stack } from 'expo-router';

export default function LegalLayout() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: '#020617' },
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#f8fafc',
      }}
    />
  );
}
