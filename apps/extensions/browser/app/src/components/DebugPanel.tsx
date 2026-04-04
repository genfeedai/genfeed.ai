import { useAuth } from '@clerk/chrome-extension';
import { useEffect, useState } from 'react';
import { getJWTToken } from '~services/auth.service';

interface DebugInfo {
  isLoaded: boolean;
  isSignedIn: boolean;
  hasToken: boolean;
  tokenPreview: string | null;
  timestamp: string;
}

export default function DebugPanel() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({
    hasToken: false,
    isLoaded: false,
    isSignedIn: false,
    timestamp: '',
    tokenPreview: null,
  });

  useEffect(() => {
    async function updateDebugInfo() {
      const token = isSignedIn ? await getJWTToken(getToken) : null;
      setDebugInfo({
        hasToken: !!token,
        isLoaded,
        isSignedIn,
        timestamp: new Date().toISOString(),
        tokenPreview: token ? `${token.substring(0, 20)}...` : null,
      });
    }

    updateDebugInfo();
  }, [isLoaded, isSignedIn, getToken]);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <div className="fixed top-0 right-0 bg-background border border-white/[0.08] shadow-lg p-2 text-xs max-w-xs z-50">
      <div className="font-bold mb-1 text-foreground">Debug Panel</div>
      <div className="text-foreground">Loaded: {isLoaded ? 'Yes' : 'No'}</div>
      <div className="text-foreground">
        Signed In: {isSignedIn ? 'Yes' : 'No'}
      </div>
      <div className="text-foreground">
        Token: {debugInfo.hasToken ? 'Yes' : 'No'}
      </div>
      {debugInfo.tokenPreview && (
        <div className="text-foreground">Token: {debugInfo.tokenPreview}</div>
      )}
      <div className="text-muted-foreground">Time: {debugInfo.timestamp}</div>
    </div>
  );
}
