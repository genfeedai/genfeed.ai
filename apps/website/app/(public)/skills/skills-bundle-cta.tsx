'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import { ArrowRight, Loader, Sparkles } from 'lucide-react';

type SkillsBundleCtaProps = {
  bundlePrice: number | string;
  checkoutLoading: boolean;
  onCheckout: () => void;
};

export default function SkillsBundleCta({
  bundlePrice,
  checkoutLoading,
  onCheckout,
}: SkillsBundleCtaProps): React.ReactElement {
  return (
    <WebSection bg="subtle" className="gsap-section">
      <NeuralGrid columns={1}>
        <NeuralGridItem
          padding="lg"
          align="center"
          className="bg-[var(--gen-accent-bg)]"
        >
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-surface/50 text-xs font-black uppercase tracking-widest mb-6">
              All Pro Skills Included
            </div>
            <h2 className="text-5xl font-semibold text-surface mb-4">
              Get Pro Skills
            </h2>
            <div className="text-6xl font-semibold text-surface mb-8">
              ${bundlePrice}
            </div>
            <Button
              variant={ButtonVariant.DEFAULT}
              size={ButtonSize.PUBLIC}
              className="min-w-skill-col"
              disabled={checkoutLoading}
              onClick={onCheckout}
            >
              {checkoutLoading ? (
                <Loader className="size-4 animate-spin" />
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Buy Bundle
                  <ArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </NeuralGridItem>
      </NeuralGrid>
    </WebSection>
  );
}
