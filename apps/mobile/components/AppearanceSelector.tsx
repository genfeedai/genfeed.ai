import {
  THEME_PREFERENCES,
  type ThemePreference,
} from '@genfeedai/contracts/constants';
import type { NativeThemeColors } from '@genfeedai/ui/semantic/mobile';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { borderRadius } from '@/constants';
import { useMobileTheme } from '@/contexts/theme-context';
import { useThemedStyles } from '@/hooks/use-themed-styles';

const APPEARANCE_LABELS: Record<ThemePreference, string> = {
  dark: 'Dark',
  light: 'Light',
  system: 'System',
};

interface AppearanceSelectorProps {
  description: string;
}

export function AppearanceSelector({ description }: AppearanceSelectorProps) {
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
        'Appearance not saved',
        'The theme changed for this session, but the preference could not be saved. Try again when you are online.',
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View>
      <Text style={styles.title}>Appearance</Text>
      <Text style={styles.description}>{description}</Text>

      <View
        accessibilityLabel="Appearance"
        accessibilityRole="radiogroup"
        style={styles.options}
      >
        {THEME_PREFERENCES.map((themePreference) => {
          const isSelected = preference === themePreference;
          const label = APPEARANCE_LABELS[themePreference];

          return (
            <Pressable
              accessibilityLabel={`${label} appearance`}
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
              <Text
                style={[
                  styles.optionLabel,
                  isSelected && styles.optionLabelSelected,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const createStyles = (colors: NativeThemeColors) =>
  StyleSheet.create({
    description: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 5,
    },
    option: {
      alignItems: 'center',
      backgroundColor: colors.bgTertiary,
      borderColor: colors.bgBorder,
      borderRadius: borderRadius.xl,
      borderWidth: 1,
      flex: 1,
      justifyContent: 'center',
      minHeight: 44,
      paddingHorizontal: 8,
    },
    optionLabel: {
      color: colors.textPrimary,
      fontSize: 14,
      fontWeight: '600',
    },
    optionLabelSelected: {
      color: colors.primaryForeground,
    },
    optionPressed: {
      opacity: 0.75,
    },
    optionSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    options: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 14,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 16,
      fontWeight: '600',
    },
  });
