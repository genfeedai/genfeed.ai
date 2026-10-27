import {
  AFFILIATE_FAQ,
  AFFILIATE_PROGRAM,
  AFFILIATE_STEPS,
} from '@data/affiliate-program.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { Coins, Gift, Link2, Share2 } from 'lucide-react';

const AFFILIATE_HUB_PATH = '/settings/referrals';

export default function AffiliatesContent() {
  // Signed-in visitors land on the Affiliate Hub; everyone else is sent through
  // sign-in and returned to it.
  const hubHref = `${EnvironmentService.apps.app}${AFFILIATE_HUB_PATH}`;

  return (
    <MarketingEntrance hero={false} sections={false}>
      <PageLayout
        badge="Affiliates"
        badgeIcon={Share2}
        title={
          <>
            Share Genfeed.{' '}
            <span className="italic font-light">Earn credits.</span>
          </>
        }
        description={AFFILIATE_PROGRAM.earnings.description}
      >
        <WebSection maxWidth="lg" py="md">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.DEFAULT}
            >
              <a href={hubHref}>Get your affiliate link</a>
            </Button>
          </div>
        </WebSection>

        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="What you get"
            description="One program, one reward, paid in credits you can spend on output."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3} className="gsap-grid">
            <NeuralGridItem
              icon={Coins}
              title={AFFILIATE_PROGRAM.earnings.title}
              description={`${AFFILIATE_PROGRAM.rewardSources.earns} earn a reward. ${AFFILIATE_PROGRAM.rewardSources.excludes} do not.`}
              className="gsap-card"
              padding="lg"
            />
            <NeuralGridItem
              icon={Gift}
              title={AFFILIATE_PROGRAM.payout.title}
              description={AFFILIATE_PROGRAM.payout.description}
              className="gsap-card"
              padding="lg"
            />
            <NeuralGridItem
              icon={Link2}
              title={AFFILIATE_PROGRAM.referredUser.title}
              description={AFFILIATE_PROGRAM.referredUser.description}
              className="gsap-card"
              padding="lg"
            />
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="How it works"
            description={`Your link and rewards live in ${AFFILIATE_PROGRAM.hubLocation}.`}
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3}>
            {AFFILIATE_STEPS.map((step, index) => (
              <NeuralGridItem
                key={step.title}
                title={`${index + 1}. ${step.title}`}
                description={step.description}
                padding="lg"
              />
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="md" className="gsap-section">
          <SectionHeader
            title="Common Questions"
            description="The terms above are what billing pays out."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <FaqGrid items={[...AFFILIATE_FAQ]} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Get your link."
          description="Sign in to copy your affiliate link, or create a free account first."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={hubHref}>Get your affiliate link</a>
          </Button>
        </CtaSection>
      </PageLayout>
    </MarketingEntrance>
  );
}
