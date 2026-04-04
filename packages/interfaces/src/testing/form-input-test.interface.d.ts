import type { ReactNode } from 'react';
import type { Control } from 'react-hook-form';
export interface ITestFormWrapperProps {
    children: (control: Control<TestFormValues>) => ReactNode;
}
export interface TestFormValues {
    testInput?: string;
    email?: string;
}
//# sourceMappingURL=form-input-test.interface.d.ts.map