export interface TerminalDemoLine {
  command: string;
  prompt: string;
}

export interface TerminalDemoProps {
  /** Passed from the server page so the skills catalog stays off the client. */
  lines: readonly TerminalDemoLine[];
}
