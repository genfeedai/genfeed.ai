import { SignInButton } from '@clerk/chrome-extension';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { useThemeLogo } from '~hooks/ui/use-theme-logo/use-theme-logo';

export default function LoginPage() {
  const logoUrl = useThemeLogo();

  return (
    <div className="flex flex-col items-center justify-center py-8">
      {logoUrl && (
        <Image src={logoUrl} width={80} alt="Genfeed" className="mb-6" />
      )}

      <h2 className="text-2xl font-bold mb-2 text-foreground">
        Welcome to Genfeed
      </h2>
      <p className="text-muted-foreground text-center mb-6 px-4">
        Generate AI content from posts and create amazing videos
      </p>

      <div className="w-full max-w-xs space-y-4">
        <SignInButton mode="modal">
          <Button
            type="button"
            variant={ButtonVariant.DEFAULT}
            className="w-full shadow"
          >
            Sign in with Genfeed
          </Button>
        </SignInButton>

        <p className="text-xs text-muted-foreground text-center">
          You'll be redirected to genfeed.ai to sign in securely
        </p>
      </div>

      <div className="mt-8 text-center">
        <div className="relative w-full border border-info/50 bg-background px-4 py-3 text-sm text-info mb-4">
          <div>
            <p className="text-sm font-medium mb-1">🎯 Invite Only</p>
            <p className="text-xs">
              Genfeed is currently in private beta. You need an invitation to
              access the platform.
            </p>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-2">
          Don't have an invitation?
        </p>
        <a
          href="https://genfeed.ai/waitinglist"
          target="_blank"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          rel="noopener"
        >
          Request access
        </a>
      </div>
    </div>
  );
}
