import Card from '@ui/card/Card';
import { Badge } from '@ui/primitives/badge';
import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ProvidersStatusCardProps } from '@/features/onboarding/props/providers-status-card.props';

export default function ProvidersStatusCard({
  accessStatusLabel,
}: ProvidersStatusCardProps) {
  const translate = useTranslations('pages.onboarding.providers');

  return (
    <Card className="provider-card opacity-0" bodyClassName="gap-0 p-5 md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold text-foreground">
          Default access
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Server defaults come first. If you save your own provider key later,
          Genfeed will use your organization&apos;s key instead.
        </p>
      </div>

      <div className="rounded-md bg-hover p-4 text-sm text-muted-foreground">
        <Badge
          className="mb-2"
          icon={<Sparkles />}
          shape="pill"
          size="lg"
          variant="secondary"
        >
          Server Defaults First
        </Badge>
        <p>
          Start with the server configuration, then bring your own keys later
          from Organization → API Keys if you want provider control or BYOK
          billing.
        </p>
        <p className="mt-3">{translate('keyValidationNotice')}</p>
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-muted-foreground">
          {accessStatusLabel}
        </p>
      </div>
    </Card>
  );
}
