'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import {
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import { LuArrowRight, LuLoader, LuSparkles } from 'react-icons/lu';

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
        <NeuralGridItem inverted padding="lg" align="center">
          <div className="max-w-2xl mx-auto py-8">
            <div className="text-inv-fg/30 text-xs font-black uppercase tracking-widest mb-6">
              All Pro Skills Included
            </div>
            <h2 className="text-5xl font-serif text-inv-fg mb-4">
              Get Pro Skills
            </h2>
            <div className="text-6xl font-serif text-inv-fg mb-8">
              ${bundlePrice}
            </div>
            <Button
              variant={ButtonVariant.BLACK}
              size={ButtonSize.PUBLIC}
              className="min-w-skill-col"
              disabled={checkoutLoading}
              onClick={onCheckout}
            >
              {checkoutLoading ? (
                <LuLoader className="size-4 animate-spin" />
              ) : (
                <>
                  <LuSparkles className="size-4" />
                  Buy Bundle
                  <LuArrowRight className="size-4" />
                </>
              )}
            </Button>
          </div>
        </NeuralGridItem>
      </NeuralGrid>
    </WebSection>
  );
}
