import CoreAppShell from '@/components/shell/CoreAppShell';

export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <CoreAppShell>{children}</CoreAppShell>;
}
