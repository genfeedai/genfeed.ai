export type SignUpMode = 'chooser' | 'magic-link' | 'password';

export interface SignUpBetterAuthProps {
  mode?: SignUpMode;
}
