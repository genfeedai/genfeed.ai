import { ButtonVariant } from '@genfeedai/contracts';
import { GithubIcon } from '@genfeedai/helpers/ui/icons/brands';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export function GitHubLink({
  href,
  children,
  variant = ButtonVariant.SECONDARY,
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <Button variant={variant} asChild className={className}>
      <Link href={href} target="_blank" rel="noopener noreferrer">
        <GithubIcon className="size-5" />
        {children}
      </Link>
    </Button>
  );
}
