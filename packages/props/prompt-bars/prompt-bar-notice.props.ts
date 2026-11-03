import type { ReactNode } from 'react';

export type PromptBarNoticeTone = 'error' | 'info';

export interface PromptBarNoticeProps {
  children: ReactNode;
  /** `error` is announced as an alert; `info` as a status. @default 'error' */
  tone?: PromptBarNoticeTone;
}
