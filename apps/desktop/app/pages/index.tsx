import dynamic from 'next/dynamic';

const DesktopApp = dynamic(
  () => import('../src/renderer/App').then((module) => module.App),
  {
    loading: () => (
      <div className="desktop-loading-state">Launching Genfeed...</div>
    ),
    ssr: false,
  },
);

export default function DesktopHomePage() {
  return <DesktopApp />;
}
