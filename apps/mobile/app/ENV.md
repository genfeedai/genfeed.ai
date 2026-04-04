# Environment Variables

This document describes all environment variables used in the mobile app.

## Setup

1. Create a `.env` file in the root directory
2. Copy variables from this document
3. Fill in your actual values

## Required Variables

### API Configuration
```bash
EXPO_PUBLIC_API_URL=https://api.genfeed.ai
```
The API base URL for backend requests.

### Authentication (Clerk)
```bash
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your-key-here
```
Clerk publishable key for authentication. Get from Clerk dashboard.

### Error Tracking (Sentry)
```bash
EXPO_PUBLIC_SENTRY_DSN=https://your-dsn@sentry.io/project-id
```
Sentry DSN for error tracking. Get from Sentry project settings.

### Analytics (Segment)
```bash
EXPO_PUBLIC_SEGMENT_WRITE_KEY=your-segment-write-key
```
Segment write key for analytics. Get from Segment workspace.

### Expo Project ID
```bash
EXPO_PROJECT_ID=your-expo-project-id
```
Expo project ID for push notifications. Get from Expo dashboard or run `eas init`.

## Optional Variables

### Feature Flags
```bash
EXPO_PUBLIC_ENABLE_ANALYTICS=true
EXPO_PUBLIC_ENABLE_ERROR_TRACKING=true
EXPO_PUBLIC_DEBUG=false
```
Feature flags to enable/disable features.

### Environment
```bash
NODE_ENV=development
```
Environment mode (development, staging, production).

## Accessing Variables

Variables prefixed with `EXPO_PUBLIC_` are accessible in the app via:
```typescript
import Constants from 'expo-constants';

const apiUrl = Constants.expoConfig?.extra?.apiUrl;
```

## Production

For production builds, set environment variables in:
- EAS Secrets (recommended): `eas secret:create`
- Build profiles in `eas.json`
- CI/CD environment variables

## Security

- Never commit `.env` file to git
- Use EAS Secrets for sensitive values
- Use `EXPO_PUBLIC_` prefix only for non-sensitive values

