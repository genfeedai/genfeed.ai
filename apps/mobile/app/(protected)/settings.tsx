import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppearanceSelector } from '@/components/AppearanceSelector';
import { borderRadius } from '@/constants';
import { useThemedStyles } from '@/hooks/use-themed-styles';

export default function Settings() {
  const styles = useThemedStyles(createStyles);

  return (
    <ScrollView contentContainerStyle={styles.content} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Personalize how Genfeed looks on this device.
        </Text>
      </View>

      <View style={styles.section}>
        <AppearanceSelector description="Your choice syncs with your account when you are signed in." />
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.bgPrimary,
      flex: 1,
    },
    content: {
      gap: 24,
      padding: 24,
      paddingBottom: 48,
    },
    header: {
      gap: 8,
    },
    section: {
      backgroundColor: colors.bgSecondary,
      borderRadius: borderRadius.xxxl,
      padding: 20,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 28,
      fontWeight: '700',
    },
  });
