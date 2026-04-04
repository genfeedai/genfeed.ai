import { useEffect, useState } from 'react';

export function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(navigator.platform?.includes('Mac') ?? false);
  }, []);
  return isMac;
}
