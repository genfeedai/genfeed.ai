'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useIntersectionObserver } from '@hooks/ui/use-intersection-observer/use-intersection-observer';
import { EnvironmentService } from '@services/core/environment.service';
import { VStack } from '@ui/layout/stack';
import { Button } from '@ui/primitives/button';
import { SectionHeader } from '@ui/sections/header';
import { Text } from '@ui/typography/text';
import { useEffect, useState } from 'react';
import { FaGithub } from 'react-icons/fa6';
import { HiCheckCircle, HiCodeBracket } from 'react-icons/hi2';

const TERMINAL_COMMANDS = [
  { command: '# Clone the repo', isComment: true },
  {
    command: 'git clone https://github.com/genfeedai/core.git',
    isComment: false,
  },
  { command: 'cd core', isComment: false },
  { command: '# Install dependencies', isComment: true },
  { command: 'bun install', isComment: false },
  { command: '# Start development servers', isComment: true },
  { command: 'bun dev', isComment: false },
] as const;

function TerminalWindow(): React.ReactElement {
  const [currentLine, setCurrentLine] = useState(0);
  const [showProgress, setShowProgress] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    if (currentLine < TERMINAL_COMMANDS.length) {
      const delay = TERMINAL_COMMANDS[currentLine].isComment ? 400 : 800;
      const timer = setTimeout(() => setCurrentLine((prev) => prev + 1), delay);
      return () => clearTimeout(timer);
    }
    if (currentLine === TERMINAL_COMMANDS.length && !showProgress) {
      const timer = setTimeout(() => setShowProgress(true), 500);
      return () => clearTimeout(timer);
    }
    if (showProgress && !showSuccess) {
      const timer = setTimeout(() => setShowSuccess(true), 1500);
      return () => clearTimeout(timer);
    }
  }, [currentLine, showProgress, showSuccess]);

  return (
    <div className=" overflow-hidden border border-edge/[0.08] bg-black shadow-2xl">
      {/* Terminal header */}
      <div className="bg-fill/5 px-6 py-3 border-b border-edge/10 flex items-center gap-2">
        <div className="flex gap-2">
          <div className="w-3 h-3 rounded-full bg-fill/10" />
          <div className="w-3 h-3 rounded-full bg-fill/10" />
          <div className="w-3 h-3 rounded-full bg-fill/10" />
        </div>
        <Text className="ml-4 text-[10px] font-black uppercase tracking-widest text-surface/20">
          terminal
        </Text>
      </div>

      {/* Terminal content */}
      <div className="p-8 font-mono text-sm leading-relaxed min-h-code-block-lg">
        {TERMINAL_COMMANDS.slice(0, currentLine).map((line, idx) => (
          <Text
            as="p"
            key={`${line.command}-${idx}`}
            className={`mb-2 ${line.isComment ? 'text-surface/40' : 'text-surface'}`}
          >
            {!line.isComment && (
              <Text as="span" className="text-surface/20">
                ${' '}
              </Text>
            )}
            {line.command}
          </Text>
        ))}

        {currentLine < TERMINAL_COMMANDS.length && (
          <Text as="p" className="text-surface flex items-center gap-1">
            <Text as="span" className="text-surface/20">
              ${' '}
            </Text>
            <Text as="span" className="w-2 h-4 bg-fill/40 animate-pulse" />
          </Text>
        )}

        {showProgress && (
          <VStack className="mt-6 gap-1">
            <div className="flex justify-between text-[10px] text-surface/20 uppercase tracking-tighter">
              <Text>Starting dev servers</Text>
              <Text>100%</Text>
            </div>
            <div className="w-full h-1 bg-fill/5 rounded-full overflow-hidden">
              <div className="h-full bg-surface w-full transition-all duration-1000" />
            </div>
          </VStack>
        )}

        {showSuccess && (
          <Text as="p" className="mt-6 text-green-400">
            ✓ Ready at localhost:3000
          </Text>
        )}
      </div>
    </div>
  );
}

export default function HomeOpenSource(): React.ReactElement {
  const { ref, isIntersecting } = useIntersectionObserver<HTMLElement>({
    threshold: 0.2,
    triggerOnce: true,
  });

  return (
    <section ref={ref} className="gen-section-spacing-lg bg-fill/[0.02]">
      <div className="container mx-auto px-6">
        <div className="flex flex-col lg:flex-row items-center gap-24">
          {/* Left content */}
          <div className="lg:w-1/2">
            <SectionHeader
              icon={HiCodeBracket}
              label="Open Source"
              title={
                <>
                  Fully <span className="font-light">Open.</span>
                  <br />
                  Self-hosted <span className="font-light">First.</span>
                </>
              }
              align="left"
              size="xl"
              className="mb-10"
            />
            <Text
              as="p"
              className="text-lg text-surface/40 mb-12 leading-relaxed"
            >
              Your data, your models, your infrastructure. Genfeed is built on
              the belief that creative power should be decentralized. Clone the
              repo and start building in minutes.
            </Text>
            <ul className="space-y-6 mb-12">
              <li className="flex items-center gap-4 text-surface/70">
                <HiCheckCircle className="h-5 w-5 text-surface" />
                <Text>AGPL Licensed Core</Text>
              </li>
              <li className="flex items-center gap-4 text-surface/70">
                <HiCheckCircle className="h-5 w-5 text-surface" />
                <Text>Local-first model execution</Text>
              </li>
              <li className="flex items-center gap-4 text-surface/70">
                <HiCheckCircle className="h-5 w-5 text-surface" />
                <Text>End-to-end encryption by default</Text>
              </li>
            </ul>
            <Button
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
            >
              <a
                href={EnvironmentService.github.core}
                target="_blank"
                rel="noopener noreferrer"
              >
                <FaGithub className="h-5 w-5" />
                Star on GitHub
              </a>
            </Button>
          </div>

          {/* Right terminal */}
          <div className="lg:w-1/2 w-full">
            {isIntersecting && <TerminalWindow />}
          </div>
        </div>
      </div>
    </section>
  );
}
