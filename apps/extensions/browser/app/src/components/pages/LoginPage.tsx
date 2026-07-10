import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useThemeLogo } from '~hooks/ui/use-theme-logo/use-theme-logo';
import { EnvironmentService } from '~services/environment.service';

export default function LoginPage() {
  const logoUrl = useThemeLogo();
  const signInUrl = `${EnvironmentService.appDomain}/login`;
  const signUpUrl = `${EnvironmentService.appDomain}/sign-up?source=browser-extension`;

  const handleSignIn = () => {
    chrome.tabs
      .create({ url: signInUrl })
      .catch(() => window.open(signInUrl, '_blank', 'noopener,noreferrer'));
  };

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {logoUrl && (
        <Image src={logoUrl} width={80} alt="Genfeed" className="mb-6" />
      )}

      <h2 className="text-2xl font-semibold mb-2 text-foreground">
        Welcome to Genfeed
      </h2>
      <p className="text-muted-foreground text-center mb-6 px-4">
        Generate AI content from posts and create amazing videos
      </p>

      <div className="w-full max-w-xs space-y-4">
        <Button
          type="button"
          variant={ButtonVariant.DEFAULT}
          className="w-full shadow"
          onClick={handleSignIn}
        >
          Sign in with Genfeed
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          You'll be redirected to genfeed.ai to sign in securely
        </p>
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-muted-foreground mb-2">
          Don't have an account?
        </p>
        <a
          href={signUpUrl}
          target="_blank"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          rel="noopener noreferrer"
        >
          Create a free account
        </a>
      </div>
    </div>
  );
}
