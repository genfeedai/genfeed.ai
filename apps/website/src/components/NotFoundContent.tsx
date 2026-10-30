import NotFoundState from '@ui/feedback/NotFoundState';
import PageLayout from '@web-components/PageLayout';

interface NotFoundContentProps {
  title: string;
  message: string;
  backLinkHref?: string;
  backLinkLabel?: string;
}

export default function NotFoundContent({
  title,
  message,
  backLinkHref = '/',
  backLinkLabel = 'Back to Home',
}: NotFoundContentProps) {
  return (
    <PageLayout title="Not Found" description={title}>
      <NotFoundState
        title={title}
        message={message}
        backLinkHref={backLinkHref}
        backLinkLabel={backLinkLabel}
      />
    </PageLayout>
  );
}
