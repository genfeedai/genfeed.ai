import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

interface UserContext {
  id: string;
  email?: string;
  organizationId?: string;
}

class SentryService {
  private isInitialized = false;

  init(): void {
    if (this.isInitialized || !SENTRY_DSN) {
      return;
    }

    Sentry.init({
      attachStacktrace: true,
      beforeSend(event) {
        // Filter out sensitive data
        if (event.request?.headers) {
          delete event.request.headers.Authorization;
          delete event.request.headers.Cookie;
        }
        return event;
      },
      debug: __DEV__,
      dist: Constants.expoConfig?.extra?.buildNumber || '1',
      dsn: SENTRY_DSN,
      enableAutoPerformanceTracing: true,
      enableAutoSessionTracking: true,
      enableNativeCrashHandling: true,
      environment: __DEV__ ? 'development' : 'production',
      release: Constants.expoConfig?.version || '1.0.0',
      sessionTrackingIntervalMillis: 30000,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
    });

    this.isInitialized = true;
  }

  setUser(user: UserContext | null): void {
    if (!this.isInitialized) {
      return;
    }

    if (user) {
      Sentry.setUser({
        email: user.email,
        id: user.id,
      });
      if (user.organizationId) {
        Sentry.setTag('organization_id', user.organizationId);
      }
    } else {
      Sentry.setUser(null);
    }
  }

  captureException(error: Error, context?: Record<string, unknown>): string {
    if (!this.isInitialized) {
      return '';
    }

    return Sentry.captureException(error, {
      extra: context,
    });
  }

  captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: Record<string, unknown>,
  ): string {
    if (!this.isInitialized) {
      return '';
    }

    return Sentry.captureMessage(message, {
      extra: context,
      level,
    });
  }

  addBreadcrumb(breadcrumb: {
    category: string;
    message: string;
    level?: Sentry.SeverityLevel;
    data?: Record<string, unknown>;
  }): void {
    if (!this.isInitialized) {
      return;
    }

    Sentry.addBreadcrumb({
      category: breadcrumb.category,
      data: breadcrumb.data,
      level: breadcrumb.level || 'info',
      message: breadcrumb.message,
    });
  }

  setTag(key: string, value: string): void {
    if (!this.isInitialized) {
      return;
    }
    Sentry.setTag(key, value);
  }

  setContext(name: string, context: Record<string, unknown> | null): void {
    if (!this.isInitialized) {
      return;
    }
    Sentry.setContext(name, context);
  }

  startTransaction(name: string, op: string): Sentry.Span | undefined {
    if (!this.isInitialized) {
      return undefined;
    }
    return Sentry.startInactiveSpan({ name, op });
  }

  wrap<T>(component: T): T {
    return Sentry.wrap(component as React.ComponentType) as T;
  }
}

export const sentryService = new SentryService();

// Export Sentry for direct usage when needed
export { Sentry };
