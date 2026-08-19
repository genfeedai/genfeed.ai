import {
  THEME_PREFERENCES,
  type ThemePreference,
} from '@genfeedai/constants';
import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { borderRadius } from '@/constants';
import { useMobileTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';

const APPEARANCE_COPY: Record<
  ThemePreference,
  { description: string; label: string }
> = {
  dark: {
    description: 'Use dark surfaces and light text.',
    label: 'Dark',
  },
  light: {
    description: 'Use light surfaces and dark text.',
    label: 'Light',
  },
  system: {
    description: 'Match this device automatically.',
    label: 'System',
  },
};

export default function Settings() {
  const { preference, setPreference } = useMobileTheme();
  const styles = useThemedStyles(createStyles);
  const [isSaving, setIsSaving] = useState(false);

  const choosePreference = async (nextPreference: ThemePreference) => {
    if (isSaving || nextPreference === preference) {
      return;
    }

    setIsSaving(true);
    try {
      await setPreference(nextPreference);
    } catch {
      Alert.alert(
        'Appearance not synced',
        'The theme changed on this device, but your account could not be updated. Try again when you are online.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>
          Personalize how Genfeed looks on this device.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <Text style={styles.sectionDescription}>
          Your choice syncs with your account when you are signed in.
        </Text>

        <View
          accessibilityLabel="Appearance"
          accessibilityRole="radiogroup"
          style={styles.options}
        >
          {THEME_PREFERENCES.map((themePreference) => {
            const isSelected = preference === themePreference;
            const copy = APPEARANCE_COPY[themePreference];

            return (
              <Pressable
                accessibilityLabel={`${copy.label} appearance`}
                accessibilityRole="radio"
                accessibilityState={{
                  checked: isSelected,
                  disabled: isSaving,
                }}
                disabled={isSaving}
                key={themePreference}
                onPress={() => void choosePreference(themePreference)}
                style={({ pressed }) => [
                  styles.option,
                  isSelected && styles.optionSelected,
                  pressed && styles.optionPressed,
                ]}
              >
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.radio,
                    isSelected && styles.radioSelected,
                  ]}
                >
                  {isSelected ? <View style={styles.radioDot} /> : null}
                </View>
                <View style={styles.optionCopy}>
                  <Text style={styles.optionLabel}>{copy.label}</Text>
                  <Text style={styles.optionDescription}>
                    {copy.description}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
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
    option: {
      alignItems: 'center',
      backgroundColor: colors.bgTertiary,
      borderColor: colors.bgBorder,
      borderRadius: borderRadius.xxl,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 12,
      minHeight: 64,
      padding: 14,
    },
    optionCopy: {
      flex: 1,
      gap: 3,
    },
    optionDescription: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    optionLabel: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
    optionPressed: {
      opacity: 0.75,
    },
    optionSelected: {
      borderColor: colors.ring,
    },
    options: {
      gap: 10,
      marginTop: 16,
    },
    radio: {
      alignItems: 'center',
      borderColor: colors.textMuted,
      borderRadius: borderRadius.full,
      borderWidth: 2,
      height: 22,
      justifyContent: 'center',
      width: 22,
    },
    radioDot: {
      backgroundColor: colors.primary,
      borderRadius: borderRadius.full,
      height: 10,
      width: 10,
    },
    radioSelected: {
      borderColor: colors.primary,
    },
    section: {
      backgroundColor: colors.bgSecondary,
      borderRadius: borderRadius.xxxl,
      padding: 20,
    },
    sectionDescription: {
      color: colors.textMuted,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 6,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontSize: 18,
      fontWeight: '600',
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
