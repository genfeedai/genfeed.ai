import type {
  HarnessProfileScope,
  ICreateHarnessProfilePayload,
  IHarnessProfile,
} from '@genfeedai/contracts/interfaces';

export type HarnessHeaderProps = {
  draft: ICreateHarnessProfilePayload;
  isPromoting?: boolean;
  isSaving: boolean;
  onPromoteWinners?: () => void;
  onSave: () => void;
};

export type HarnessIdentityCardProps = {
  draft: ICreateHarnessProfilePayload;
  scopes: readonly HarnessProfileScope[];
  onDraftChange: <Key extends keyof IHarnessProfile>(
    key: Key,
    value: IHarnessProfile[Key],
  ) => void;
  onScopeChange: (value: string) => void;
  joinLines: (value: string[] | undefined) => string;
  splitLines: (value: string) => string[];
};

export type HarnessRightColumnProps = {
  draft: ICreateHarnessProfilePayload;
  onListChange: (
    section: 'examples' | 'structure' | 'thesis',
    key: string,
    value: string,
  ) => void;
  onDraftChange: <Key extends keyof IHarnessProfile>(
    key: Key,
    value: IHarnessProfile[Key],
  ) => void;
  joinLines: (value: string[] | undefined) => string;
  splitLines: (value: string) => string[];
};

export type HarnessVoiceCardProps = {
  voice: IHarnessProfile['voice'] | undefined;
  onVoiceChange: (
    key: keyof NonNullable<IHarnessProfile['voice']>,
    value: string | string[],
  ) => void;
  joinLines: (value: string[] | undefined) => string;
  splitLines: (value: string) => string[];
};
