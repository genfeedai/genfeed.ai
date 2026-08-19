import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { borderRadius } from '@/constants';
import { useMobileAuth } from '@/contexts/auth-context';
import { useMobileTheme } from '@/contexts/theme-context';
import { usePendingApprovalCount } from '@/hooks/use-approvals';
import { useThemedStyles } from '@/hooks/use-themed-styles';

function SignOutButton() {
  const { signOut } = useMobileAuth();
  return <Button title="Sign out" onPress={() => signOut()} />;
}

function ApprovalBadge() {
  const { count, isLoading } = usePendingApprovalCount();
  const styles = useThemedStyles(createStyles);

  if (isLoading || count === 0) {
    return null;
  }

  return (
    <View style={styles.badgeContainer}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

export default function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useMobileAuth();
  const { colors } = useMobileTheme();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.replace('/login');
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || !isSignedIn) {
    return null;
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
      <Tabs.Screen
        name="approvals"
        options={{
          tabBarIcon: () => <ApprovalBadge />,
          title: 'Approvals',
        }}
      />
      <Tabs.Screen name="ideas" options={{ title: 'Ideas' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen
        name="approval"
        options={{
          href: null, // Hide from tab bar - only accessible via deep link
        }}
      />
    </Tabs>
  );
}

const createStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    badgeContainer: {
      alignItems: 'center',
      backgroundColor: colors.error,
      borderRadius: borderRadius.xl,
      height: 20,
      justifyContent: 'center',
      minWidth: 20,
      paddingHorizontal: 6,
      position: 'absolute',
      right: -8,
      top: -4,
    },
    badgeText: {
      color: colors.errorForeground,
      fontSize: 11,
      fontWeight: '600',
    },
  });
