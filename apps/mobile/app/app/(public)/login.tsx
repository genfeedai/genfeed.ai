import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';
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
  const { isLoaded, signInWithEmail, signInWithGoogleIdToken } =
    useMobileAuth();
  const router = useRouter();
  const extra = Constants.expoConfig?.extra ?? {};
  const [googleRequest, , promptGoogleAsync] = Google.useIdTokenAuthRequest({
    androidClientId:
      typeof extra.googleOAuthAndroidClientId === 'string'
        ? extra.googleOAuthAndroidClientId
        : undefined,
    clientId:
      typeof extra.googleOAuthClientId === 'string'
        ? extra.googleOAuthClientId
        : undefined,
    iosClientId:
      typeof extra.googleOAuthIosClientId === 'string'
        ? extra.googleOAuthIosClientId
        : undefined,
    webClientId:
      typeof extra.googleOAuthWebClientId === 'string'
        ? extra.googleOAuthWebClientId
        : undefined,
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

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

  const handleGoogleSignIn = async () => {
    if (!isLoaded || isGoogleLoading) {
      return;
    }

    try {
      setIsGoogleLoading(true);
      const result = await promptGoogleAsync();

      // Anything other than a completed flow is not a failure: 'cancel' and
      // 'dismiss' mean the user closed the OAuth popup, and 'opened'/'locked'
      // are non-terminal states. Only a genuine 'error' warrants an alert.
      if (result.type !== 'success') {
        if (result.type === 'error') {
          Alert.alert(
            'Google sign in failed',
            result.error?.message || 'An error occurred',
          );
        }
        return;
      }

      const auth = result.authentication;
      // Prefer the canonical OIDC field; fall back to the raw params entry.
      const idToken =
        auth?.idToken ??
        (result.params?.id_token as string | undefined) ??
        null;

      if (!idToken) {
        Alert.alert(
          'Google sign in failed',
          'Google did not return an ID token. Please try again.',
        );
        return;
      }

      // Forward the nonce so the server can verify it against the token claim.
      const nonce = googleRequest?.nonce ?? null;

      await signInWithGoogleIdToken({
        accessToken: auth?.accessToken ?? null,
        idToken,
        nonce,
      });
      router.replace('/content');
    } catch (err: unknown) {
      const error = err as { message?: string };
      Alert.alert(
        'Google sign in failed',
        error.message || 'An error occurred',
      );
    } finally {
      setIsGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.form}>
        <Pressable
          disabled={isGoogleLoading || !googleRequest}
          onPress={handleGoogleSignIn}
          style={[
            styles.googleButton,
            isGoogleLoading && styles.signInButtonDisabled,
          ]}
        >
          {isGoogleLoading ? (
            <ActivityIndicator color={colors.textPrimary} size="small" />
          ) : (
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          )}
        </Pressable>

        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>

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
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  dividerLine: {
    backgroundColor: colors.bgBorder,
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  googleButton: {
    alignItems: 'center',
    backgroundColor: colors.bgTertiary,
    borderColor: colors.bgBorder,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
  },
  googleButtonText: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
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
