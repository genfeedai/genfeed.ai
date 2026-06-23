import { Redirect } from 'expo-router';
import { useMobileAuth } from '@/contexts/auth-context';

export default function Index() {
  const { isLoaded, isSignedIn } = useMobileAuth();
  if (!isLoaded) {
    return null;
  }
  return <Redirect href={isSignedIn ? '/content' : '/login'} />;
}
