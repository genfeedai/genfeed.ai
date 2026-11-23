// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearBootRecord,
  writeBootRecord,
} from '@/lib/boot-record/boot-record';
import { createBootRecord } from '@/lib/boot-record/boot-record.fixture';
import { useBootRecord } from '@/lib/boot-record/use-boot-record';

const identity = vi.hoisted(() => ({
  hasSessionReadFailed: false,
  isLoaded: false,
  isSignedIn: false,
  userId: null as string | null,
}));

vi.mock('@genfeedai/hooks/auth/use-auth-identity/use-auth-identity', () => ({
  useAuthIdentity: () => identity,
}));
vi.mock('@genfeedai/helpers/auth/auth.helper', () => ({
  getPlaywrightAuthState: () => null,
}));

const stored = createBootRecord();

function Probe({ slug }: { slug: string | undefined }) {
  const record = useBootRecord(slug);
  return <p data-testid="probe">{record ? record.organizationSlug : 'none'}</p>;
}

describe('useBootRecord', () => {
  beforeEach(() => {
    window.localStorage.clear();
    // The session the fixture record was written under.
    document.cookie = 'genfeed_session_tag=tag-1; path=/';
    identity.hasSessionReadFailed = false;
    identity.isLoaded = false;
    identity.isSignedIn = false;
    identity.userId = null;
    writeBootRecord(stored);
  });

  it('offers the record for its organization before the session has answered', () => {
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('acme');
  });

  it('offers nothing when the record was written under another session, before the session answers', () => {
    document.cookie = 'genfeed_session_tag=tag-2; path=/';
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('offers nothing when the page carries no session tag', () => {
    document.cookie = 'genfeed_session_tag=; path=/; max-age=0';
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('keeps the record when the session read failed: a failed read is not signed out', () => {
    identity.isLoaded = true;
    identity.isSignedIn = false;
    identity.hasSessionReadFailed = true;
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('acme');
  });

  it('offers nothing for another organization', () => {
    render(<Probe slug="other" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('keeps the record once the session answers with the same user', () => {
    identity.isLoaded = true;
    identity.isSignedIn = true;
    identity.userId = 'user-1';
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('acme');
  });

  it('drops the record when the session is another user', () => {
    identity.isLoaded = true;
    identity.isSignedIn = true;
    identity.userId = 'user-2';
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('drops the record when the session answers signed out', () => {
    identity.isLoaded = true;
    identity.isSignedIn = false;
    render(<Probe slug="acme" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });

  it('follows the stored record when it is cleared', () => {
    render(<Probe slug="acme" />);
    act(() => clearBootRecord());

    expect(screen.getByTestId('probe')).toHaveTextContent('none');
  });
});
