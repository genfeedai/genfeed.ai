import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';

type ConversationHeaderProps = {
  isGenerating: boolean;
  onFocusLocalProvider: () => void;
  onOpenCreditsCheckout: () => Promise<void>;
  onOpenProviderKeys: () => Promise<void>;
  title: string;
  error: string | null;
};

function isGenerationAccessError(message: string | null): boolean {
  if (!message) {
    return false;
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes('credits') ||
    normalized.includes('api key') ||
    normalized.includes('provider')
  );
}

export function ConversationHeader({
  isGenerating,
  onFocusLocalProvider,
  onOpenCreditsCheckout,
  onOpenProviderKeys,
  title,
  error,
}: ConversationHeaderProps) {
  return (
    <>
      <div className="conversation-header">
        <div>
          <h2 className="conversation-title">{title}</h2>
          <p className="muted-text conversation-subtitle">
            Build a workspace-backed content run, then generate, publish, and
            iterate from one native surface.
          </p>
        </div>
        {isGenerating && <span className="generating-badge">Generating…</span>}
      </div>

      {error && (
        <div className="error-banner">
          <span>{error}</span>
          {isGenerationAccessError(error) && (
            <div className="error-banner-actions">
              <Button
                className="small"
                onClick={() => void onOpenCreditsCheckout()}
                type="button"
                variant={ButtonVariant.GHOST}
              >
                Buy credits
              </Button>
              <Button
                className="small"
                onClick={() => void onOpenProviderKeys()}
                type="button"
                variant={ButtonVariant.GHOST}
              >
                Add provider keys
              </Button>
              <Button
                className="small"
                onClick={onFocusLocalProvider}
                type="button"
                variant={ButtonVariant.GHOST}
              >
                Local provider
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
