'use client';

interface HelpTextProps {
  children: React.ReactNode;
}

/**
 * Help text displayed when node is waiting for input
 */
export function HelpText({ children }: HelpTextProps): React.JSX.Element {
  return (
    <div className="text-xs text-muted-foreground text-center">{children}</div>
  );
}
