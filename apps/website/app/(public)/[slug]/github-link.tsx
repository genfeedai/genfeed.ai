import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';
import { FaGithub } from 'react-icons/fa6';

export function GitHubLink({
  href,
  children,
  variant = ButtonVariant.OUTLINE,
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
        <FaGithub className="size-5" />
        {children}
      </Link>
    </Button>
  );
}
