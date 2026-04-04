/**
 * Expo App Configuration
 * Dynamic configuration with environment variable support
 */

export default {
  expo: {
    android: {
      adaptiveIcon: {
        backgroundColor: '#ffffff',
        foregroundImage: './assets/images/adaptive-icon.png',
      },
      edgeToEdgeEnabled: true,
      package: 'ai.genfeed.mobile',
      permissions: [
        'CAMERA',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'RECORD_AUDIO',
        'INTERNET',
        'ACCESS_NETWORK_STATE',
      ],
      versionCode: 1,
    },

    experiments: {
      typedRoutes: true,
    },

    extra: {
      // Public environment variables (accessible in app)
      apiUrl: process.env.EXPO_PUBLIC_API_URL || 'https://api.genfeed.ai',
      clerkPublishableKey: process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || '',
      debug: process.env.EXPO_PUBLIC_DEBUG === 'true',
      eas: {
        projectId: process.env.EXPO_PROJECT_ID || '',
      },
      enableAnalytics: process.env.EXPO_PUBLIC_ENABLE_ANALYTICS === 'true',
      enableErrorTracking:
        process.env.EXPO_PUBLIC_ENABLE_ERROR_TRACKING === 'true',
      segmentWriteKey: process.env.EXPO_PUBLIC_SEGMENT_WRITE_KEY || '',
      sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || '',
    },
    icon: './assets/images/icon.png',

    ios: {
      associatedDomains: ['applinks:genfeed.ai'],
      buildNumber: '1',
      bundleIdentifier: 'ai.genfeed.mobile',
      infoPlist: {
        NSCameraUsageDescription:
          'We need camera access to capture photos and videos for content creation.',
        NSMicrophoneUsageDescription:
          'We need microphone access to record video with audio.',
        NSPhotoLibraryUsageDescription:
          'We need photo library access to select media for content creation.',
      },
      supportsTablet: true,
    },
    name: 'Genfeed',
    newArchEnabled: true,
    orientation: 'portrait',

    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#ffffff',
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          resizeMode: 'contain',
        },
      ],
      [
        'expo-notifications',
        {
          color: '#ffffff',
          icon: './assets/images/notification-icon.png',
          sounds: ['./assets/sounds/notification.wav'],
        },
      ],
      [
        'sentry-expo',
        {
          authToken: process.env.SENTRY_AUTH_TOKEN,
          organization: process.env.EXPO_PUBLIC_SENTRY_ORG,
          project: process.env.EXPO_PUBLIC_SENTRY_PROJECT,
        },
      ],
    ],
    scheme: 'genfeed',
    slug: 'mobile.genfeed.ai',

    splash: {
      backgroundColor: '#ffffff',
      image: './assets/images/splash-icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
    },
    userInterfaceStyle: 'automatic',
    version: '1.0.0',

    web: {
      bundler: 'metro',
      favicon: './assets/images/favicon.png',
      output: 'static',
    },
  },
};
