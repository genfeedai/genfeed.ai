export type HelpResourceId =
  | 'gettingStarted'
  | 'documentation'
  | 'workflows'
  | 'changelog'
  | 'faq'
  | 'community'
  | 'support';

export interface HelpDestinationConfig {
  documentation?: string;
  gettingStarted?: string;
  selfHostedGettingStarted?: string;
  workflows?: string;
  faq?: string;
  changelog?: string;
  cloudSupport?: string;
  selfHostedSupport?: string;
  community?: string;
}

export interface HelpResource {
  id: HelpResourceId;
  url: string | null;
  owner: 'documentation' | 'product' | 'community' | 'deployment-operator';
}

export interface HelpResourceCardProps {
  resource: HelpResource;
  selfHosted: boolean;
}
