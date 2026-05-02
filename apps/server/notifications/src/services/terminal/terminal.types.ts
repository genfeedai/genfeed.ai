export type TerminalSessionKind = 'claude' | 'codex' | 'genfeed' | 'shell';

export interface TerminalCreatePayload {
  cols?: number;
  cwd?: string;
  kind?: TerminalSessionKind;
  rows?: number;
}

export interface TerminalSessionDto {
  command: string;
  createdAt: string;
  cwd: string;
  id: string;
  kind: TerminalSessionKind;
  pid: number;
}

export interface TerminalDataPayload {
  data: string;
  sessionId: string;
}

export interface TerminalExitPayload {
  exitCode?: number;
  sessionId: string;
  signal?: number;
}

export interface TerminalWritePayload {
  data: string;
  sessionId: string;
}

export interface TerminalResizePayload {
  cols: number;
  rows: number;
  sessionId: string;
}

export interface TerminalKillPayload {
  sessionId: string;
}
