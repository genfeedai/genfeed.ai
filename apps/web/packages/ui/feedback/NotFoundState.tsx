import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import Link from 'next/link';

export interface NotFoundStateProps {
  title: string;
  message: string;
  backLinkHref?: string;
  backLinkLabel?: string;
  className?: string;
  containerClassName?: string;
}

export default function NotFoundState({
  title,
  message,
  backLinkHref = '/',
  backLinkLabel = 'Back to Home',
  className,
  containerClassName,
}: NotFoundStateProps) {
  return (
    <div className={containerClassName}>
      <div className={cn('mx-auto max-w-4xl py-20 text-center', className)}>
        <h1 className="mb-4 text-4xl font-bold">{title}</h1>
        <p className="mb-8 text-muted-foreground">{message}</p>

        <Button asChild>
          <Link href={backLinkHref}>{backLinkLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
