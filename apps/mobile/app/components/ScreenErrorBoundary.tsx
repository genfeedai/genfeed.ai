import { useRouter } from 'expo-router';
import React, { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface ScreenErrorFallbackProps {
  onRetry: () => void;
}

function ScreenErrorFallback({ onRetry }: ScreenErrorFallbackProps): ReactNode {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.emoji}>😕</Text>
        <Text style={styles.title}>Oops!</Text>
        <Text style={styles.subtitle}>
          Something went wrong loading this screen.
        </Text>

        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [
              styles.retryButton,
              pressed && styles.retryButtonPressed,
            ]}
            onPress={onRetry}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.backButtonPressed,
            ]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

interface ScreenErrorBoundaryProps {
  children: ReactNode;
}

interface ScreenErrorBoundaryState {
  key: number;
}

export class ScreenErrorBoundary extends React.Component<
  ScreenErrorBoundaryProps,
  ScreenErrorBoundaryState
> {
  state = { key: 0 };

  handleRetry = (): void => {
    this.setState((prev) => ({ key: prev.key + 1 }));
  };

  render(): ReactNode {
    return (
      <ErrorBoundary
        key={this.state.key}
        fallback={<ScreenErrorFallback onRetry={this.handleRetry} />}
      >
        {this.props.children}
      </ErrorBoundary>
    );
  }
}

const styles = StyleSheet.create({
  actions: {
    gap: 12,
    width: '100%',
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#1e293b',
    borderRadius: 12,
    borderWidth: 2,
    paddingVertical: 14,
  },
  backButtonPressed: {
    opacity: 0.8,
  },
  backButtonText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '500',
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#020617',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    maxWidth: 300,
  },
  emoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  retryButton: {
    alignItems: 'center',
    backgroundColor: '#6366f1',
    borderRadius: 12,
    paddingVertical: 14,
  },
  retryButtonPressed: {
    opacity: 0.8,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 32,
    textAlign: 'center',
  },
  title: {
    color: 'white',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
});

export default ScreenErrorBoundary;
