import { ButtonSize } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import FaqGrid from '@web-components/content/FaqGrid';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';

const signupUrl = new URL('/sign-up', EnvironmentService.apps.app);
signupUrl.searchParams.set('utm_source', 'website');
signupUrl.searchParams.set('utm_campaign', 'turbo');
export const TURBO_SIGNUP_HREF = signupUrl.toString();

const STEPS = [
  { title: 'Sign up', description: 'Create your Genfeed account in a minute.' },
  {
    title: 'Tell us about your business',
    description: "Your website, what you sell, who it's for and how you talk.",
  },
  {
    title: 'Get your first posts',
    description:
      'Turbo drafts on-brand images, video and captions, ready to review.',
  },
  {
    title: 'Swipe to approve',
    description: "Keep what fits, skip what doesn't, schedule the rest.",
  },
];

const FAQS = [
  {
    question: 'Do I need a credit card?',
    answer: 'No. Create your account and your first posts come with it.',
  },
  {
    question: 'What if my website says little about my business?',
    answer:
      "Turbo asks a few quick questions before generating, so drafts aren't generic.",
  },
  {
    question: 'Which platforms?',
    answer:
      'Drafts follow the platforms in your brand strategy; you choose where to schedule.',
  },
  {
    question: 'Does anything post automatically?',
    answer: 'No. You approve every post.',
  },
];

function TurboSignupButton() {
  return (
    <ButtonTracked
      asChild
      size={ButtonSize.PUBLIC}
      trackingData={{ action: 'start_signup' }}
      trackingName="turbo_signup_click"
    >
      <a href={TURBO_SIGNUP_HREF}>Start with Turbo</a>
    </ButtonTracked>
  );
}

export default function TurboContent() {
  return (
    <MarketingEntrance>
      <PageLayout
        badge="Turbo"
        compact
        description="Tell Genfeed about your business once. Turbo drafts images, video and captions that sound like you."
        heroActions={
          <div className="flex flex-col items-start gap-3">
            <TurboSignupButton />
            <Text className="text-sm text-surface/65">
              No credit card needed.
            </Text>
          </div>
        }
        heroMedia={
          <MarketingArtwork page="/turbo" isCompact kind="integration" />
        }
        heroVisual={
          <EditorialPoster
            eyebrow="Turbo"
            title="Your brand in. On-brand content out."
            items={STEPS.map((step) => ({
              label: step.title,
              value: step.description,
            }))}
          />
        }
        showFooter={false}
        title="Your brand in. On-brand content out."
      >
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-8 text-surface">
            How it works
          </Heading>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {STEPS.map((step) => (
              <div
                key={step.title}
                className="gsap-card gen-card-spotlight p-8"
              >
                <Heading as="h3" className="font-semibold mb-2 text-surface">
                  {step.title}
                </Heading>
                <Text className="text-sm text-surface/65">
                  {step.description}
                </Text>
              </div>
            ))}
          </div>
        </section>
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            Nothing posts without you.
          </Heading>
          <Text className="text-surface/65">
            Every draft waits for your approval. Reject one and tell us why; the
            next batch learns from it.
          </Text>
        </section>
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
            Gets sharper every batch.
          </Heading>
          <Text className="text-surface/65">
            Turbo learns from what you approve and what performs, so each batch
            fits your brand better.
          </Text>
        </section>
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-6 sm:p-12 text-center">
            <PricingStrip className="mb-6" />
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <TurboSignupButton />
            </div>
          </div>
        </section>
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h2" className="text-2xl font-bold mb-8 text-surface">
            Frequently asked questions
          </Heading>
          <FaqGrid items={FAQS} />
        </section>
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-6 sm:p-12 text-center">
            <Heading as="h2" className="text-2xl font-bold mb-6 text-surface">
              Ready when you are.
            </Heading>
            <div className="flex justify-center">
              <TurboSignupButton />
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
