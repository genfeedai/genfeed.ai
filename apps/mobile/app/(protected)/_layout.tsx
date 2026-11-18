import { Redirect, Tabs } from 'expo-router';
import { Button } from 'react-native';
import { useMobileAuth } from '@/contexts/auth-context';
import { useMobileTheme } from '@/contexts/theme-context';

function SignOutButton() {
  const { signOut } = useMobileAuth();
  return <Button title="Sign out" onPress={() => signOut()} />;
}

export default function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useMobileAuth();
  const { colors } = useMobileTheme();

  if (!isLoaded) {
    return null;
  }

  if (!isSignedIn) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerRight: () => <SignOutButton />,
        headerStyle: {
          backgroundColor: colors.bgSecondary,
        },
        headerTintColor: colors.textPrimary,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarStyle: {
          backgroundColor: colors.bgSecondary,
          borderTopColor: colors.bgTertiary,
        },
      }}
    >
      <Tabs.Screen name="content" options={{ title: 'Library' }} />
      <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
