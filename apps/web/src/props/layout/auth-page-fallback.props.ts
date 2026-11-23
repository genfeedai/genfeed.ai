/** The auth pages that show a prerendered frame before their form is read. */
export type AuthPageFallbackVariant =
  | 'forgot'
  | 'login'
  | 'login-magic'
  | 'login-email'
  | 'reset'
  | 'sign-up'
  | 'sign-up-magic'
  | 'sign-up-email';

export interface AuthPageFallbackProps {
  variant: AuthPageFallbackVariant;
}
