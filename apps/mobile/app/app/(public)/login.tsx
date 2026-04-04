import { useSignIn, useSSO } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// Required for OAuth flow
WebBrowser.maybeCompleteAuthSession();

export default function Login() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startSSOFlow } = useSSO();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (!isLoaded || isLoading) {
      return;
    }

    try {
      setIsLoading(true);
      const result = await signIn.create({ identifier: email, password });
      await setActive({ session: result.createdSessionId });
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

  const handleOAuthSignIn = useCallback(
    async (strategy: 'oauth_google' | 'oauth_apple') => {
      if (!isLoaded) {
        return;
      }

      try {
        setOauthLoading(strategy);

        const { createdSessionId, setActive: setActiveSession } =
          await startSSOFlow({
            redirectUrl: 'exp://localhost:8081/--/oauth-callback',
            strategy,
          });

        if (createdSessionId && setActiveSession) {
          await setActiveSession({ session: createdSessionId });
          router.replace('/content');
        }
      } catch (err: unknown) {
        const error = err as {
          errors?: { message: string }[];
          message?: string;
        };
        Alert.alert(
          'Sign in failed',
          error.errors?.[0]?.message || error.message || 'An error occurred',
        );
      } finally {
        setOauthLoading(null);
      }
    },
    [isLoaded, startSSOFlow, router],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>
      </View>

      <View style={styles.oauthContainer}>
        <Pressable
          style={[styles.oauthButton, styles.googleButton]}
          onPress={() => handleOAuthSignIn('oauth_google')}
          disabled={!!oauthLoading}
        >
          {oauthLoading === 'oauth_google' ? (
            <ActivityIndicator color="#000" size="small" />
          ) : (
            <>
              <Text style={styles.oauthIcon}>G</Text>
              <Text style={styles.oauthButtonText}>Continue with Google</Text>
            </>
          )}
        </Pressable>

        {Platform.OS === 'ios' && (
          <Pressable
            style={[styles.oauthButton, styles.appleButton]}
            onPress={() => handleOAuthSignIn('oauth_apple')}
            disabled={!!oauthLoading}
          >
            {oauthLoading === 'oauth_apple' ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Text style={styles.appleIcon}></Text>
                <Text style={styles.appleButtonText}>Continue with Apple</Text>
              </>
            )}
          </Pressable>
        )}
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.dividerLine} />
      </View>

      <View style={styles.form}>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            placeholder="Enter your email"
            placeholderTextColor="#64748b"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            style={styles.input}
            editable={!isLoading}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Password</Text>
          <TextInput
            placeholder="Enter your password"
            placeholderTextColor="#64748b"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            editable={!isLoading}
          />
        </View>

        <Pressable
          style={[
            styles.signInButton,
            isLoading && styles.signInButtonDisabled,
          ]}
          onPress={handleSignIn}
          disabled={isLoading || !email || !password}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.signInButtonText}>Sign In</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  appleButton: {
    backgroundColor: '#000',
  },
  appleButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  appleIcon: {
    color: '#fff',
    fontSize: 18,
  },
  container: {
    backgroundColor: '#0f172a',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  divider: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 24,
  },
  dividerLine: {
    backgroundColor: '#334155',
    flex: 1,
    height: 1,
  },
  dividerText: {
    color: '#64748b',
    fontSize: 14,
    paddingHorizontal: 16,
  },
  form: {
    gap: 16,
  },
  googleButton: {
    backgroundColor: '#fff',
  },
  header: {
    marginBottom: 32,
  },
  input: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderRadius: 10,
    borderWidth: 1,
    color: '#f8fafc',
    fontSize: 16,
    padding: 14,
  },
  inputContainer: {
    gap: 6,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500',
  },
  oauthButton: {
    alignItems: 'center',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  oauthButtonText: {
    color: '#1f2937',
    fontSize: 16,
    fontWeight: '600',
  },
  oauthContainer: {
    gap: 12,
    marginBottom: 24,
  },
  oauthIcon: {
    color: '#4285f4',
    fontSize: 18,
    fontWeight: 'bold',
  },
  signInButton: {
    alignItems: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 12,
    marginTop: 8,
    paddingVertical: 14,
  },
  signInButtonDisabled: {
    opacity: 0.6,
  },
  signInButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
  },
  title: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
  },
});
