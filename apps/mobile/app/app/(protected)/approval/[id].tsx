import { Stack, useRouter } from 'expo-router';
import { ErrorScreen } from '@/components/ScreenStates';

/**
 * There is no approval read, approve, or reject route. Opening a deep link
 * stays recoverable instead of calling a removed endpoint.
 */
export default function ApprovalDetail() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: 'Review' }} />
      <ErrorScreen
        message="Publish review is unavailable"
        subMessage="This review cannot be opened from the app."
        onRetry={() => router.back()}
        retryLabel="Go Back"
      />
    </>
  );
}
