import type { ConnectSetupGuide } from '@genfeedai/helpers/integrations/connect-genfeed-setup-guide.helper';

export interface ConnectSetupGuideProps {
  /** The client's steps, exactly as the MCP setup page shows them. */
  guide: ConnectSetupGuide;
}
