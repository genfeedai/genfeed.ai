import { useEffect, useState } from 'react';
import { NetworkStatus, networkService } from '@/services/network.service';

interface UseNetworkStatusReturn {
  isOnline: boolean;
  status: NetworkStatus;
  networkType: string | null;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
  const [isOnline, setIsOnline] = useState(networkService.isOnline());
  const [status, setStatus] = useState<NetworkStatus>(
    networkService.getStatus(),
  );
  const [networkType, setNetworkType] = useState<string | null>(
    networkService.getNetworkType(),
  );

  useEffect(() => {
    networkService.init();

    const handleConnectionChanged = (connected: boolean) => {
      setIsOnline(connected);
      setStatus(connected ? 'online' : 'offline');
      setNetworkType(networkService.getNetworkType());
    };

    networkService.on('connectionChanged', handleConnectionChanged);

    return () => {
      networkService.off('connectionChanged', handleConnectionChanged);
    };
  }, []);

  return {
    isOnline,
    networkType,
    status,
  };
}
