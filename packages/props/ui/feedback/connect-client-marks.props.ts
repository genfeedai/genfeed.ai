import type { ConnectClientMarkId } from '@genfeedai/helpers/integrations/connect-genfeed-clients.helper';

export interface ConnectClientMarksProps {
  className?: string;
  /** The application marks to draw, in order. */
  marks: readonly ConnectClientMarkId[];
}
