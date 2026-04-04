export interface TopbarProps {
  showMountCheck?: boolean;
  onMenuToggle?: () => void;
  isMenuOpen?: boolean;
  /** Whether the agent panel is collapsed */
  isAgentCollapsed?: boolean;
  /** Toggle agent panel visibility */
  onAgentToggle?: () => void;
}

export interface TopbarLogoProps {
  logoHref: string;
}
