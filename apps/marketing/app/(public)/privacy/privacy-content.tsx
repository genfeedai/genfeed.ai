import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import { Check, Cookie, Eye, Lock, Mail } from 'lucide-react';
import Link from 'next/link';

const privacyPolicySections = [
  {
    content: [
      'We collect information you provide directly to us when creating a brand, using our services, or contacting our support team. This may include your name, email address, payment information, and content you generate using our platform.',
      'We also automatically collect certain information about your device and how you interact with our platform, including IP address, browser type, and usage statistics.',
    ],
    shortLabel: 'Collection',
    title: 'Information We Collect',
  },
  {
    listItems: [
      'To provide, maintain, and improve our services',
      'To process transactions and manage your account',
      'To send you technical notices, updates, and support messages',
      'To respond to your comments and questions',
      'To monitor and analyze trends and usage of our platform',
    ],
    shortLabel: 'Usage',
    title: 'How We Use Your Information',
  },
  {
    content: [
      'When you sign in with Google or connect a Google service, Genfeed receives only the data the features you use need: your name, email address, and profile photo for Google sign-in; your YouTube channel details, videos, comments, live chat, and channel analytics for YouTube; the Google Ads accounts and campaign data you authorize for Google Ads; and search performance data for the properties you authorize in Google Search Console.',
      'We use this data to show your content and analytics in Genfeed and to upload videos and post the comment and live chat replies you create or configure. OAuth tokens are encrypted at rest. We do not sell Google user data, use it for advertising, or use it to develop, improve, or train generalized AI or machine learning models. We call Google’s APIs only to run the features you use, and we never use your connection to collect or refresh data for our own purposes. Genfeed staff may access Google data already stored in our systems when you ask us for support, to operate and troubleshoot the service, to investigate a security issue or abuse, or when the law requires it.',
      "Genfeed's use and transfer of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.",
      'YouTube features use YouTube API Services. By connecting YouTube you agree to the YouTube Terms of Service, and Google processes your data under the Google Privacy Policy.',
      'You can disconnect a Google service in Genfeed at any time or revoke Genfeed’s access from your Google Account permissions page. To delete data Genfeed stored from Google, contact privacy@genfeed.ai.',
    ],
    links: [
      {
        href: 'https://developers.google.com/terms/api-services-user-data-policy',
        label: 'Google API Services User Data Policy',
      },
      {
        href: 'https://www.youtube.com/t/terms',
        label: 'YouTube Terms of Service',
      },
      {
        href: 'https://policies.google.com/privacy',
        label: 'Google Privacy Policy',
      },
      {
        href: 'https://security.google.com/settings/security/permissions',
        label: 'Google Account permissions',
      },
    ],
    shortLabel: 'Google',
    title: 'Google and YouTube Data',
  },
  {
    content: [
      'When you connect Facebook or Instagram, Genfeed receives only the data the features you use need: the Facebook Pages you manage and the Instagram professional account linked to a Page; the profile details, posts, comments and performance insights of that account; and, for Instagram, the Instagram Direct conversations of that account, meaning the text of messages that people send to the account and the replies sent from it, together with the sender’s Instagram-scoped ID, username and display name.',
      'We use this data to publish posts and reels you create or schedule, show your comments, Direct messages and analytics in Genfeed, and send the comment replies, private replies and Direct message replies that you write, approve or configure. When you ask Genfeed to draft a suggested reply, the text of that conversation is sent to the AI model provider to generate the draft. We read Direct messages only for Instagram accounts you connect, and we send messages only from those accounts.',
      'Access tokens are encrypted at rest. We do not sell Meta platform data, use it for advertising, or use it to build profiles of the people who message your account. Genfeed staff may access this data when you ask us for support, to operate and troubleshoot the service, to investigate a security issue or abuse, or when the law requires it.',
      'You can disconnect Facebook or Instagram in Genfeed at any time, or remove Genfeed from your Facebook account under Settings, Apps and Websites. Deletion instructions are in the section Deleting Data from Connected Platforms.',
    ],
    id: 'meta',
    links: [
      {
        href: 'https://www.facebook.com/privacy/policy/',
        label: 'Meta Privacy Policy',
      },
      {
        href: 'https://www.facebook.com/settings?tab=applications',
        label: 'Facebook Apps and Websites settings',
      },
    ],
    shortLabel: 'Meta',
    title: 'Facebook and Instagram Data',
  },
  {
    content: [
      'When you connect TikTok, Genfeed receives only the data the scopes you approve allow: your profile details (display name, avatar, bio, profile link and verification status), your account statistics (follower, following, like and video counts), and your public videos with their statistics.',
      'We use this data to show your TikTok profile and analytics in Genfeed and to send videos you create to your account, either as a draft in your TikTok inbox or as a post. Before a post is sent, you choose its title, who can view it, whether comments, Duet and Stitch are allowed, and whether it promotes your own brand or is a paid partnership, and you confirm TikTok’s Music Usage Confirmation. Genfeed sends content to TikTok only after you confirm. We do not read or send TikTok direct messages.',
      'Access tokens are encrypted at rest. We do not sell TikTok user data or use it for advertising. You can disconnect TikTok in Genfeed at any time, or remove Genfeed from the TikTok app under Settings and privacy, Security and permissions, Apps and services.',
    ],
    id: 'tiktok',
    links: [
      {
        href: 'https://www.tiktok.com/legal/page/global/privacy-policy/en',
        label: 'TikTok Privacy Policy',
      },
    ],
    shortLabel: 'TikTok',
    title: 'TikTok Data',
  },
  {
    content: [
      'To delete data Genfeed stored from a connected platform (Google and YouTube, Facebook and Instagram, or TikTok), do one of the following. In Genfeed, open Settings, disconnect the account, and delete the content you no longer want. Or email privacy@genfeed.ai from the address on your Genfeed account with the subject Data deletion request, and name the platform and the connected account.',
      'Disconnecting an account stops Genfeed from accessing it. On a deletion request we also delete the messages, comments and profile data we stored from that account, and we confirm by email when it is done.',
      'You can also remove Genfeed’s access on the platform itself: Facebook and Instagram under Settings, Apps and Websites; Google under Google Account permissions; TikTok under Apps and services. Removing access stops new data from being collected. It does not by itself delete data already stored, so email us if you also want that data deleted.',
    ],
    id: 'data-deletion',
    shortLabel: 'Deletion',
    title: 'Deleting Data from Connected Platforms',
  },
  {
    content: [
      'The Genfeed Chrome extension adds a Genfeed button next to the reply box on X, LinkedIn, Reddit, Threads, Facebook, Instagram, TikTok and YouTube. It fills the reply box and you post it yourself. It reads a page only when you use a feature and does not record the sites you visit.',
      'When you generate a reply, proofread or rewrite a draft, make an image, video or GIF, or save a page as a source, the extension sends the text you are working on, the author and URL of the post or page, and your brand voice to the Genfeed API over HTTPS. On X and LinkedIn it also records the text, link, author handle and date of a post or reply you publish, so Genfeed can show analytics for it. If you turn on the optional local fallback, that text goes to the Genfeed bridge on your own computer instead.',
      'The extension keeps your session, settings, saved-source lists and unsent drafts in Chrome extension storage. Removing the extension or clearing its data deletes them. Crash reports go to Sentry without request bodies, cookies, user information or AI inputs and outputs.',
      'We do not sell this data or use it for advertising. The use of information received from Chrome APIs adheres to the Chrome Web Store User Data Policy, including the Limited Use requirements. To delete data in your Genfeed account, delete it in the app or contact privacy@genfeed.ai.',
    ],
    links: [
      {
        href: 'https://developer.chrome.com/docs/webstore/program-policies/user-data-faq',
        label: 'Chrome Web Store User Data Policy',
      },
    ],
    shortLabel: 'Extension',
    title: 'Browser Extension',
  },
];

const privacyRights = [
  {
    description:
      'You have the right to access personal data we hold about you and to request that we correct, update, or delete your information at any time.',
    icon: Eye,
    shortLabel: 'Access',
    title: 'Data Access',
  },
  {
    description:
      'Genfeed.ai is committed to protecting your data using industry-standard security measures. However, no method of transmission over the Internet is 100% secure.',
    icon: Lock,
    shortLabel: 'Security',
    title: 'Data Security',
  },
  {
    description:
      'We use cookies and similar technologies to enhance your experience, analyze usage, and assist in our marketing efforts. You can control cookies through your browser settings.',
    icon: Cookie,
    shortLabel: 'Cookies',
    title: 'Cookie Policy',
  },
];

export default function PrivacyContent() {
  return (
    <MarketingEntrance cards={false}>
      <PageLayout
        compact
        title={<>Privacy Policy</>}
        description="How we protect your data. We don't sell your information."
      >
        <section className="py-16 md:py-32 gsap-hero">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto">
              <div className="grid gap-px bg-foreground/10">
                {privacyPolicySections.map((section) => (
                  <div
                    key={section.title}
                    id={'id' in section ? section.id : undefined}
                    className="bg-background p-6 sm:p-12 group hover:bg-foreground/5 transition-colors"
                  >
                    <h2 className="text-2xl font-semibold mb-6">
                      {section.title}
                    </h2>

                    {section.content ? (
                      <div className="space-y-4">
                        {section.content.map((paragraph) => (
                          <p
                            key={`${section.shortLabel}-${paragraph}`}
                            className="text-foreground/60 text-sm leading-relaxed"
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    ) : section.listItems ? (
                      <ul className="space-y-3">
                        {section.listItems.map((item) => (
                          <li key={item} className="flex items-start gap-3">
                            <Check className="size-4 text-foreground/70 mt-0.5 shrink-0" />
                            <span className="text-foreground/60 text-sm">
                              {item}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {section.links ? (
                      <ul className="mt-6 space-y-2">
                        {section.links.map((link) => (
                          <li key={link.href}>
                            <Link
                              href={link.href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-foreground/80 text-sm underline underline-offset-4 hover:text-foreground transition-colors"
                            >
                              {link.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Privacy Rights */}
        <section className="py-16 md:py-32 bg-foreground/5 gsap-section">
          <div className="container mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-5xl font-semibold mb-6">
                Your Privacy Rights
              </h2>
              <p className="text-foreground/70 max-w-xl mx-auto">
                We believe in transparency and your right to control your data.
              </p>
            </div>

            <div className="max-w-4xl mx-auto">
              <div className="grid grid-cols-1 gap-px bg-foreground/10 md:grid-cols-3">
                {privacyRights.map((right) => {
                  const Icon = right.icon;
                  return (
                    <div
                      key={right.title}
                      className="bg-background p-6 sm:p-10 group hover:bg-foreground/5 transition-colors"
                    >
                      <Icon className="size-8 text-foreground/70 mb-4 group-hover:text-foreground transition-colors" />
                      <h3 className="text-lg font-semibold mb-3">
                        {right.title}
                      </h3>
                      <p className="text-foreground/70 text-sm leading-relaxed">
                        {right.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Contact CTA */}
        <section className="py-20 md:py-40 gsap-section">
          <div className="container mx-auto px-6">
            <div className="text-center max-w-3xl mx-auto">
              <Mail className="size-12 mx-auto text-foreground/60 mb-8" />
              <h2 className="text-5xl font-semibold mb-10">Questions?</h2>
              <p className="text-foreground/70 text-xl mb-12 font-medium">
                If you have any questions about our privacy practices, please
                contact our privacy team.
              </p>
              <Button
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
              >
                <Link href="mailto:privacy@genfeed.ai">
                  Contact Privacy Team
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
