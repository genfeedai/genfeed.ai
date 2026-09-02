import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';

export interface ITestFormWrapperProps {
  children: (control: Control<TestFormValues>) => ReactNode;
}

export interface TestFormValues {
  testInput?: string;
  email?: string;
}
