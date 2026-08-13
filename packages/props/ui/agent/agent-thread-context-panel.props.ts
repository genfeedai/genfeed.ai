import type { ReactNode } from 'react';

export interface AgentThreadContextSectionProps {
  action?: ReactNode;
  children: ReactNode;
  title: string;
}

export interface AgentThreadContextRowProps {
  label: string;
  value: string;
}

export interface AgentThreadContextSectionLinkProps {
  href: string;
  label: string;
}
