import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { type RenderOptions, render } from '@testing-library/react';
import { ThemeProvider } from 'next-themes';
import type { ReactElement, ReactNode } from 'react';
import { FormProvider, useForm } from 'react-hook-form';

interface WrapperProps {
  children: ReactNode;
}

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { gcTime: 0, retry: false },
    },
  });
}

// All the providers in one place
function AllTheProviders({ children }: WrapperProps) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}

// Custom render function that includes providers
const customRender = (
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllTheProviders, ...options });

/**
 * Creates a wrapper component that provides react-hook-form context.
 * Use when testing components that call useFormContext().
 *
 * Usage:
 *   render(<FormInput name="email" />, { wrapper: createFormWrapper({ email: '' }) });
 */
export function createFormWrapper(defaultValues: Record<string, unknown> = {}) {
  return function FormWrapper({ children }: { children: ReactNode }) {
    const methods = useForm({ defaultValues });
    return <FormProvider {...methods}>{children}</FormProvider>;
  };
}

export * from '@testing-library/react';
export { createTestQueryClient, customRender as render };
