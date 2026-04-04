import React from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useOfflineQueue } from '@/hooks/use-offline-queue';

export function OfflineIndicator(): React.ReactElement | null {
  const { isOnline } = useNetworkStatus();
  const { queueLength } = useOfflineQueue();
  const opacity = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(opacity, {
      duration: 300,
      toValue: isOnline ? 0 : 1,
      useNativeDriver: true,
    }).start();
  }, [isOnline, opacity]);

  if (isOnline && queueLength === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      <View style={styles.content}>
        <View style={styles.dot} />
        <Text style={styles.text}>
          {isOnline
            ? `Syncing ${queueLength} item${queueLength !== 1 ? 's' : ''}...`
            : "You're offline"}
        </Text>
      </View>
    </Animated.View>
  );
}

interface OfflineBannerProps {
  message?: string;
}

export function OfflineBanner({
  message,
}: OfflineBannerProps): React.ReactElement | null {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <View style={bannerStyles.container}>
      <Text style={bannerStyles.text}>
        {message ||
          "No internet connection. Changes will sync when you're back online."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    left: 16,
    position: 'absolute',
    right: 16,
    top: 60,
    zIndex: 1000,
  },
  content: {
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  dot: {
    backgroundColor: '#ef4444',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  text: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
});

const bannerStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    color: '#78350f',
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
});

export default OfflineIndicator;
