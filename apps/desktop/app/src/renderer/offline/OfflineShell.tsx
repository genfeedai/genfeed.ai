import type {
  IDesktopBootstrap,
  IDesktopCloudProject,
  IDesktopDataResult,
} from '@genfeedai/desktop-contracts';
import { ButtonVariant } from '@genfeedai/enums';
import { Button } from '@ui/primitives/button';
import { useEffect, useState } from 'react';

interface OfflineShellProps {
  bootstrap: IDesktopBootstrap;
}

export default function OfflineShell({ bootstrap }: OfflineShellProps) {
  const [projects, setProjects] = useState<IDesktopCloudProject[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.genfeedDesktop.cloud
      .listProjects()
      .then((result) => {
        const typedResult = result as unknown as IDesktopDataResult<
          IDesktopCloudProject[]
        >;

        if (cancelled || typedResult.status !== 'success') {
          return;
        }

        setProjects(typedResult.data);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  const handleQueuedAction = async (
    action: Promise<unknown>,
  ): Promise<void> => {
    const result = (await action) as IDesktopDataResult<unknown>;

    if (result.status === 'queued_offline') {
      setStatusMessage('Queued - will sync when you sign in');
    }
  };

  return (
    <div className="offline-shell" data-testid="offline-shell">
      <aside className="offline-shell-sidebar">
        <h1>Offline Mode</h1>
        <p>{bootstrap.localUser.name}</p>
        <p>Sign in to enable cloud publishing and generation.</p>

        <section>
          <h2>Workspaces</h2>
          <ul data-testid="offline-workspaces">
            {bootstrap.workspaces.map((workspace) => (
              <li key={workspace.id}>{workspace.name}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2>Projects</h2>
          <ul data-testid="offline-projects">
            {projects.map((project) => (
              <li key={project.id}>{project.name}</li>
            ))}
          </ul>
        </section>
      </aside>

      <main className="offline-shell-content">
        <h2>Local-first drafting</h2>
        <p>Cloud actions are available after you sign in.</p>

        <div className="offline-shell-actions">
          <Button
            disabled={false}
            onClick={() =>
              void handleQueuedAction(
                window.genfeedDesktop.cloud.generateHooks('offline topic'),
              )
            }
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Generate Hooks
          </Button>
          <span>Sign in to enable</span>
        </div>

        <div className="offline-shell-actions">
          <Button
            disabled={false}
            onClick={() =>
              void handleQueuedAction(
                window.genfeedDesktop.cloud.publishPost({
                  content: 'offline draft',
                  platform: 'twitter',
                }),
              )
            }
            type="button"
            variant={ButtonVariant.SECONDARY}
          >
            Publish Post
          </Button>
          <span>Sign in to enable</span>
        </div>

        {statusMessage ? <p>{statusMessage}</p> : null}
      </main>
    </div>
  );
}
