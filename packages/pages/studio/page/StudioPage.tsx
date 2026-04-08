import { ButtonVariant } from '@genfeedai/enums';
import type { StudioPageProps } from '@props/studio/studio.props';
import { Button } from '@ui/primitives/button';
import { HiArrowUp } from 'react-icons/hi2';

export default function StudioPage({
  children,
  onSubmit,
  formRef,
  isGenerating = false,
  isGenerateDisabled = false,
  generateLabel = 'Generate',
  cost,
  topbar,
  preview,
  keyboard,
}: StudioPageProps): React.ReactElement {
  const generateButton = (
    <Button
      variant={ButtonVariant.GENERATE}
      icon={<HiArrowUp />}
      type="submit"
      label={generateLabel}
      isLoading={isGenerating}
      isDisabled={isGenerateDisabled}
    />
  );

  const hasCustomLayout = topbar || preview || keyboard;

  if (hasCustomLayout) {
    return (
      <form
        ref={formRef}
        onSubmit={onSubmit}
        className="flex flex-col min-h-screen"
      >
        {topbar && <div className="border-b border-primary/10">{topbar}</div>}

        <div className="flex-1 flex items-center justify-center p-6">
          {preview || children}
        </div>

        <div className="border-t border-primary/10 bg-background/80 backdrop-blur-sm">
          <div className="p-4">
            {keyboard}
            <div className="flex items-center justify-end mt-4">
              {generateButton}
            </div>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="pb-40">
      {children}

      <div className="fixed bottom-0 left-0 right-0 border border-primary/10 shadow-xl shadow-primary/10 backdrop-blur-sm bg-opacity-10">
        <div className="flex items-center justify-end p-4">
          {generateButton}
        </div>
      </div>
    </form>
  );
}
