import { useAuth } from '@clerk/clerk-expo';
import { Redirect } from 'expo-router';

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) {
    return null;
  }
  return <Redirect href={isSignedIn ? '/content' : '/login'} />;
}
