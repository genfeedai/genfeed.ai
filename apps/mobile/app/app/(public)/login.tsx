import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { borderRadius, colors } from '@/constants';
import { useMobileAuth } from '@/contexts/auth-context';

export default function Login() {
  const { isLoaded, signInWithEmail } = useMobileAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded || isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      await signInWithEmail({ email, password });
      router.replace('/content');
    } catch (err: unknown) {
      const error = err as { errors?: { message: string }[]; message?: string };
      Alert.alert(
        'Sign in failed',
        error.errors?.[0]?.message || error.message || 'An error occurred',
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            autoCapitalize="none"
            editable={!isLoading}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor={colors.textSubtle}
            style={styles.input}
            value={email}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            editable={!isLoading}
            onChangeText={setPassword}
            placeholder="Enter your password"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            style={styles.input}
            value={password}
          />
        </View>

        <Pressable
          disabled={isLoading || !email || !password}
          onPress={handleSignIn}
          style={[
            styles.signInButton,
            isLoading && styles.signInButtonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.white} size="small" />
          ) : (
            <Text style={styles.signInButtonText}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgSecondary,
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  form: {
    gap: 16,
  },
  header: {
    marginBottom: 32,
  },
  input: {
    backgroundColor: colors.bgTertiary,
    borderColor: colors.bgBorder,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    color: colors.textPrimary,
    fontSize: 16,
    padding: 14,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  signInButton: {
    alignItems: 'center',
    backgroundColor: colors.indigo,
    borderRadius: borderRadius.xxl,
    marginTop: 8,
    paddingVertical: 14,
  },
  signInButtonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 16,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
