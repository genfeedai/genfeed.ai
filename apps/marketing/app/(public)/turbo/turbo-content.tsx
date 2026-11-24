import { ButtonSize } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import ButtonTracked from '@web-components/buttons/tracked/ButtonTracked';
import FaqGrid from '@web-components/content/FaqGrid';
import MarketingEntrance from '@web-components/MarketingEntrance';
import EditorialPoster from '@web-components/marketing/EditorialPoster';
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
        compact
        description="Tell Genfeed about your business once. Turbo drafts images, video and captions that sound like you."
        heroActions={
          <div className="flex flex-col items-start gap-3">
            <TurboSignupButton />
          </div>
        }
        heroVisual={
          <EditorialPoster
            eyebrow="Turbo"
            title="Your brand in, on-brand content out"
            items={STEPS.map((step) => ({
              label: step.title,
              value: step.description,
            }))}
          />
        }
        showFooter={false}
        title="Your brand in, on-brand content out"
      >
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading
            as="h2"
            className="text-2xl font-semibold mb-8 text-foreground"
          >
            How it works
          </Heading>
          <div className="gsap-grid grid grid-cols-1 gap-1.5 md:grid-cols-2">
            {STEPS.map((step) => (
              <div
                key={step.title}
                className="gsap-card gen-card-spotlight p-8"
              >
                <Heading as="h3" className="font-semibold mb-2 text-foreground">
                  {step.title}
                </Heading>
                <Text className="text-sm text-foreground/70">
                  {step.description}
                </Text>
              </div>
            ))}
          </div>
        </section>
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading
            as="h2"
            className="text-2xl font-semibold mb-2 text-foreground"
          >
            Nothing posts without you
          </Heading>
          <Text className="text-foreground/70">
            Every draft waits for your approval. Reject one and tell us why; we
            keep your reason with it.
          </Text>
        </section>
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading
            as="h2"
            className="text-2xl font-semibold mb-2 text-foreground"
          >
            Learns from what you approve
          </Heading>
          <Text className="text-foreground/70">
            Drafts you approve become examples for your next batches, and once
            you have published posts, the ones that perform guide them too.
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
          <Heading
            as="h2"
            className="text-2xl font-semibold mb-8 text-foreground"
          >
            Frequently asked questions
          </Heading>
          <FaqGrid items={FAQS} />
        </section>
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="gen-card-spotlight p-6 sm:p-12 text-center">
            <Heading
              as="h2"
              className="text-2xl font-semibold mb-6 text-foreground"
            >
              Ready when you are
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
