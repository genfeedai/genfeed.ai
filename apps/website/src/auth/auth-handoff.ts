import { EnvironmentService } from '@services/core/environment.service';

export function buildAuthHandoffHref(
  path: 'login' | 'sign-up',
  tokenName: 'brandOsToken' | 'clipToolToken',
  previewToken: string,
): string {
  const postSignup = new URL(
    '/onboarding/post-signup',
    EnvironmentService.apps.app,
  );
  postSignup.searchParams.set(tokenName, previewToken);

  const auth = new URL(`/${path}`, EnvironmentService.apps.app);
  if (path === 'login') {
    auth.searchParams.set(
      'callbackUrl',
      `${postSignup.pathname}${postSignup.search}`,
    );
  } else {
    auth.searchParams.set(tokenName, previewToken);
  }

  return auth.toString();
}
