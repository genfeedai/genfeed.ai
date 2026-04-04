import { useAuth } from '@clerk/clerk-expo';
import { Tabs, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Button, StyleSheet, Text, View } from 'react-native';
import { usePendingApprovalCount } from '@/hooks/use-approvals';

function SignOutButton() {
  const { signOut } = useAuth();
  return <Button title="Sign out" onPress={() => signOut()} />;
}

function ApprovalBadge() {
  const { count, isLoading } = usePendingApprovalCount();

  if (isLoading || count === 0) {
    return null;
  }

  return (
    <View style={badgeStyles.container}>
      <Text style={badgeStyles.text}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#ef4444',
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    minWidth: 20,
    paddingHorizontal: 6,
    position: 'absolute',
    right: -8,
    top: -4,
  },
  text: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
});

export default function ProtectedLayout() {
  const { isLoaded, isSignedIn } = useAuth();
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
          backgroundColor: '#0f172a',
        },
        headerTintColor: '#f8fafc',
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#64748b',
        tabBarStyle: {
          backgroundColor: '#0f172a',
          borderTopColor: '#1e293b',
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
      <Tabs.Screen
        name="approval"
        options={{
          href: null, // Hide from tab bar - only accessible via deep link
        }}
      />
    </Tabs>
  );
}
