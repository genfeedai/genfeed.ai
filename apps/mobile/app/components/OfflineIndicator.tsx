import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { borderRadius } from '@/constants';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useOfflineQueue } from '@/hooks/use-offline-queue';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export function OfflineIndicator(): React.ReactElement | null {
  const styles = useThemedStyles(createStyles);
  const { isOnline } = useNetworkStatus();
  const { queueLength } = useOfflineQueue();
  const opacity = useSharedValue(0);

  React.useEffect(() => {
    opacity.value = withTiming(isOnline ? 0 : 1, { duration: 300 });
  }, [isOnline, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (isOnline && queueLength === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
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
  const bannerStyles = useThemedStyles(createBannerStyles);
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

const createStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    container: {
      left: 16,
      position: 'absolute',
      right: 16,
      top: 60,
      zIndex: 1000,
    },
    content: {
      alignItems: 'center',
      backgroundColor: colors.bgTertiary,
      borderRadius: borderRadius.xl,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    dot: {
      backgroundColor: colors.error,
      borderRadius: borderRadius.sm,
      height: 8,
      width: 8,
    },
    text: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '500',
    },
  });

const createBannerStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.warning,
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    text: {
      color: colors.warningForeground,
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
    },
  });

export default OfflineIndicator;
