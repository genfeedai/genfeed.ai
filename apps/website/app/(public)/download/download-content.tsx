'use client';

import { ButtonSize, ButtonVariant, DesktopOs } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import {
  Apple,
  Cpu,
  HardDrive,
  KeyRound,
  Monitor,
  MonitorDown,
  RefreshCw,
} from 'lucide-react';

const DOCS_URL = 'https://docs.genfeed.ai';

/**
 * The release job runs on `macos-latest` (Apple Silicon) and ships a single
 * arm64 disk image. Intel Macs need their own runner, so the requirement is
 * stated rather than silently assumed.
 */
const MAC_REQUIREMENT = 'macOS 13 Ventura or later · Apple Silicon';

const WHAT_YOU_GET = [
  {
    description:
      'A local workspace backed by an embedded database. Drafts, recents, and generation jobs live on your machine and survive going offline.',
    icon: HardDrive,
    title: 'Your workspace, on disk',
  },
  {
    description:
      'Point generation at Ollama, LM Studio, or any OpenAI-compatible endpoint. Your provider key stays on your machine and is never sent to Genfeed.',
    icon: KeyRound,
    title: 'Bring your own keys',
  },
  {
    description:
      'Sign in once and the desktop app uses the same account, brands, and channels as the web app. Genfeed Cloud generation works out of the box.',
    icon: RefreshCw,
    title: 'Same account as the web app',
  },
] as const;

const INSTALL_STEPS = [
  {
    description: 'Grab the disk image for your Mac.',
    step: 'Download',
  },
  {
    description: 'Open the .dmg and drag GenFeed into Applications.',
    step: 'Install',
  },
  {
    description:
      'Launch it. Sign in through your browser with Genfeed Connect.',
    step: 'Connect',
  },
  {
    description: 'Pick your generation provider and start creating.',
    step: 'Create',
  },
] as const;

interface DownloadContentProps {
  detectedOs: DesktopOs;
  /** Null until the first `desktop-v*` release is published. */
  downloadUrl: string | null;
  /** Pre-formatted on the server, e.g. "148 MB". */
  fileSize: string | null;
  version: string | null;
}

export default function DownloadContent({
  detectedOs,
  downloadUrl,
  fileSize,
  version,
}: DownloadContentProps) {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const releasesHref = `${EnvironmentService.github.core}/releases`;
  const appHref = EnvironmentService.apps.app;

  const hasMacBuild = downloadUrl !== null && version !== null;
  const isWindows = detectedOs === DesktopOs.WINDOWS;

  /** "v0.2.0 · 148 MB", collapsing cleanly when GitHub omits the size. */
  const buildDetail = hasMacBuild
    ? [`v${version}`, fileSize].filter(Boolean).join(' · ')
    : null;

  const macButtonLabel = hasMacBuild
    ? `Download for macOS · ${buildDetail}`
    : 'macOS build coming soon';

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Desktop"
        badgeIcon={MonitorDown}
        title={
          <>
            Genfeed, running{' '}
            <span className="italic font-light">on your Mac</span>.
          </>
        }
        description="The full content OS as a native desktop app. A local workspace that works offline, generation through your own provider keys, and the same account you already use on the web."
        heroActions={
          <>
            {/*
              A Windows visitor leads with their own (disabled) button so the
              page answers their question first, then still offers the macOS
              build as a secondary action for anyone on the wrong machine.
            */}
            {isWindows ? (
              <Button isDisabled size={ButtonSize.PUBLIC}>
                Windows build coming soon
              </Button>
            ) : null}

            {hasMacBuild ? (
              <Button
                asChild
                size={ButtonSize.PUBLIC}
                variant={
                  isWindows ? ButtonVariant.SECONDARY : ButtonVariant.DEFAULT
                }
              >
                <a href={downloadUrl}>{macButtonLabel}</a>
              </Button>
            ) : (
              <Button isDisabled size={ButtonSize.PUBLIC}>
                {macButtonLabel}
              </Button>
            )}

            <Button
              asChild
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a href={appHref} target="_blank" rel="noopener noreferrer">
                Use it in the browser
              </a>
            </Button>
          </>
        }
        heroDetails={
          <p className="text-xs text-surface/50">
            {hasMacBuild
              ? MAC_REQUIREMENT
              : 'Desktop builds are not published yet. The web app is live today.'}
          </p>
        }
      >
        <WebSection maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="Pick your platform"
            description="macOS ships first. Windows follows once the build and signing pipeline covers it."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={2}>
            <NeuralGridItem
              icon={Apple}
              title="macOS"
              tierLabel={
                hasMacBuild ? `Version ${version}` : 'Not yet released'
              }
              padding="lg"
              className={cn(
                detectedOs === DesktopOs.MAC_OS && 'bg-[var(--gen-accent-bg)]',
              )}
            >
              <p className="mt-2 text-sm text-surface/65">{MAC_REQUIREMENT}</p>

              <div className="mt-6">
                {hasMacBuild ? (
                  <Button asChild variant={ButtonVariant.SECONDARY}>
                    {/* Direct release-asset link: one hop, real filename. */}
                    <a href={downloadUrl}>
                      Download .dmg{fileSize ? ` · ${fileSize}` : ''}
                    </a>
                  </Button>
                ) : (
                  <Button isDisabled variant={ButtonVariant.SECONDARY}>
                    Coming soon
                  </Button>
                )}
              </div>

              {/*
                The cask is pushed to the tap by the same release job that
                publishes the disk image, so it only exists once a build does.
              */}
              {hasMacBuild ? (
                <p className="mt-4 text-xs text-surface/50">
                  Prefer Homebrew?{' '}
                  <span className="font-mono text-surface/75">
                    brew install --cask genfeedai/tap/genfeed
                  </span>
                </p>
              ) : null}
            </NeuralGridItem>

            <NeuralGridItem
              icon={Monitor}
              title="Windows"
              tierLabel="Coming soon"
              padding="lg"
              className={cn(isWindows && 'bg-[var(--gen-accent-bg)]')}
            >
              <p className="mt-2 text-sm text-surface/65">
                Not built yet. Use Genfeed in the browser in the meantime, or
                self-host the open-source core on your own machine.
              </p>

              <div className="mt-6">
                <Button isDisabled variant={ButtonVariant.SECONDARY}>
                  Coming soon
                </Button>
              </div>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="What the desktop app adds"
            description="Everything the web app does, plus the things only a local process can do."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={3} className="gsap-grid">
            {WHAT_YOU_GET.map((item) => (
              <NeuralGridItem
                key={item.title}
                icon={item.icon}
                title={item.title}
                description={item.description}
                className="gsap-card"
                padding="lg"
              />
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection maxWidth="xl" className="gsap-section">
          <SectionHeader
            title="Running in four steps"
            description="No terminal, no clone, no local API. Download and open."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={4}>
            {INSTALL_STEPS.map((item, index) => (
              <NeuralGridItem
                key={item.step}
                tierLabel={`0${index + 1} / ${item.step}`}
                padding="lg"
                className={cn(index === 0 && 'bg-fill/[0.02]')}
              >
                <p className="text-sm leading-relaxed text-surface/60">
                  {item.description}
                </p>
              </NeuralGridItem>
            ))}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="lg" className="gsap-section">
          <SectionHeader
            title="Desktop or browser"
            description="Same product and the same account. The desktop app adds a local workspace and your own generation providers."
            className="[&_h2]:text-5xl"
          />

          <NeuralGrid columns={2}>
            <NeuralGridItem
              icon={Cpu}
              title="Desktop app"
              tierLabel="macOS"
              padding="lg"
            >
              <ul className="space-y-3">
                {[
                  'Local workspace that works offline',
                  'Bring-your-own-key generation on your machine',
                  'Genfeed Cloud generation after sign-in',
                  'Updates install themselves in the background',
                ].map((item) => (
                  <li
                    key={item}
                    className="border-b border-edge/5 pb-3 text-sm text-surface/60 last:border-b-0 last:pb-0"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </NeuralGridItem>

            <NeuralGridItem
              icon={Monitor}
              title="Web app"
              tierLabel="Every platform"
              padding="lg"
              className="bg-[var(--gen-accent-bg)]"
            >
              <ul className="space-y-3">
                {[
                  'Nothing to install, works on any OS',
                  'Always on the newest release',
                  'Managed credits: pay only for output',
                  'Shared workspaces and team access',
                ].map((item) => (
                  <li
                    key={item}
                    className="border-b border-edge/5 pb-3 text-sm text-surface/60 last:border-b-0 last:pb-0"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Start where you are."
          description="Use Genfeed in the browser today, and install the desktop app when you want a local workspace."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={appHref} target="_blank" rel="noopener noreferrer">
              Open the web app
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <a href={releasesHref} target="_blank" rel="noopener noreferrer">
              All releases
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
              Read the docs
            </a>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
