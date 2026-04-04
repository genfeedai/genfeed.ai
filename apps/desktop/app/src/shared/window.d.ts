import type { IGenfeedDesktopBridge } from '@genfeedai/desktop-contracts';

declare global {
  interface Window {
    genfeedDesktop: IGenfeedDesktopBridge;
  }
}

export {};
