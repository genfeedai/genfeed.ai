import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import {
  type ConnectSetupPart,
  splitConnectSetupText,
} from '@genfeedai/helpers/integrations/connect-genfeed-setup-guide.helper';
import type { ConnectSetupGuideProps } from '@genfeedai/props/ui/feedback/connect-setup-guide.props';
import { CopyButton } from '@ui/buttons/CopyButton';
import { Badge } from '@ui/primitives/badge';
import { Pre } from '@ui/primitives/pre';

function SetupPart({ part }: { part: ConnectSetupPart }) {
  if (part.kind === 'command') {
    return (
      <div className="flex items-start gap-2">
        <Pre className="min-w-0 flex-1">
          <code>{part.text}</code>
        </Pre>
        <CopyButton
          label={part.label}
          size={ButtonSize.SM}
          value={part.text}
          variant={ButtonVariant.SECONDARY}
        />
      </div>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      {splitConnectSetupText(part.text).map((segment) =>
        segment.isCode ? (
          <code
            className="bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
            key={segment.offset}
          >
            {segment.text}
          </code>
        ) : (
          <span key={segment.offset}>{segment.text}</span>
        ),
      )}
    </p>
  );
}

/** One client's numbered setup steps, the same ones the MCP setup page shows. */
export default function ConnectSetupGuide({ guide }: ConnectSetupGuideProps) {
  return (
    <section aria-label={guide.title} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">{guide.title}</h2>
        {guide.badge ? <Badge variant="outline">{guide.badge}</Badge> : null}
      </div>
      <ol className="flex flex-col gap-5">
        {guide.steps.map((step, index) => (
          <li
            className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3"
            key={step.title}
          >
            <span
              aria-hidden="true"
              className="pt-0.5 font-mono text-xs text-muted-foreground"
            >
              {String(index + 1).padStart(2, '0')}
            </span>
            <div className="flex min-w-0 flex-col gap-2">
              <h3 className="text-sm font-medium">{step.title}</h3>
              {step.parts.map((part, partIndex) => (
                <SetupPart
                  key={part.kind === 'command' ? part.id : `text-${partIndex}`}
                  part={part}
                />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
