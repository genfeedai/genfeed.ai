import React, { type ReactNode } from 'react';
import { vi } from 'vitest';

interface PressState {
  pressed: boolean;
}

type PrimitiveProps = {
  children?: ReactNode;
} & Record<string, unknown>;

function createPrimitive(tagName: string) {
  return function Primitive({
    children,
    style: _style,
    ...props
  }: PrimitiveProps) {
    return React.createElement(tagName, props, children);
  };
}

function MockButton({
  onPress,
  style: _style,
  title,
  ...props
}: PrimitiveProps & {
  onPress?: () => void;
  title?: string;
}) {
  return React.createElement(
    'button',
    {
      ...props,
      onClick: onPress,
      type: 'button',
    },
    title,
  );
}

function MockPressable({
  children,
  onPress,
  style: _style,
  ...props
}: PrimitiveProps & {
  children?: ReactNode | ((state: PressState) => ReactNode);
  onPress?: () => void;
}) {
  const content =
    typeof children === 'function' ? children({ pressed: false }) : children;

  return React.createElement(
    'button',
    {
      ...props,
      onClick: onPress,
      type: 'button',
    },
    content,
  );
}

function MockTextInput({
  onChangeText,
  secureTextEntry,
  style: _style,
  value,
  ...props
}: PrimitiveProps & {
  onChangeText?: (value: string) => void;
  secureTextEntry?: boolean;
  value?: string;
}) {
  return React.createElement('input', {
    ...props,
    onChange: (event: Event) => {
      const target = event.target as HTMLInputElement;
      onChangeText?.(target.value);
    },
    type: secureTextEntry ? 'password' : 'text',
    value,
  });
}

class MockAnimatedValue {
  value: number;

  constructor(value: number) {
    this.value = value;
  }
}

const MockView = createPrimitive('div');
const MockText = createPrimitive('span');
const MockScrollView = createPrimitive('div');
const MockSafeAreaView = createPrimitive('div');
const MockImage = createPrimitive('img');
const MockActivityIndicator = createPrimitive('div');

function TabsContainer({
  children,
  screenOptions,
}: {
  children?: ReactNode;
  screenOptions?: {
    headerRight?: () => ReactNode;
  };
}) {
  return React.createElement(
    'div',
    { 'data-testid': 'tabs' },
    screenOptions?.headerRight?.(),
    children,
  );
}

const MockTabs = Object.assign(TabsContainer, {
  Screen({
    name,
    options,
  }: {
    name: string;
    options?: {
      tabBarIcon?: () => ReactNode;
      title?: string;
    };
  }) {
    return React.createElement(
      'div',
      { 'data-testid': `tab-screen-${name}` },
      options?.tabBarIcon?.(),
      options?.title ?? name,
    );
  },
});

const MockStack = Object.assign(createPrimitive('div'), {
  Screen({ name }: { name?: string }) {
    return React.createElement(
      'div',
      { 'data-testid': name ? `stack-screen-${name}` : 'stack-screen' },
      name ?? null,
    );
  },
});

// Mock process.env
process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_mock';

// Mock Expo modules
vi.mock('expo-router', () => ({
  Link: createPrimitive('a'),
  Redirect: ({ href }: { href: string }) =>
    React.createElement('div', {
      'data-href': href,
      'data-testid': 'redirect',
    }),
  Slot: createPrimitive('div'),
  Stack: MockStack,
  Tabs: MockTabs,
  useLocalSearchParams: vi.fn(() => ({})),
  useRouter: vi.fn(() => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  })),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
}));

vi.mock('expo-splash-screen', () => ({
  hideAsync: vi.fn(),
  preventAutoHideAsync: vi.fn(),
}));

vi.mock('expo-font', () => ({
  useFonts: vi.fn(() => [true, null]),
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        clerkPublishableKey: 'pk_test_mock_key',
      },
    },
  },
}));

vi.mock('expo-secure-store', () => ({
  deleteItemAsync: vi.fn(),
  getItemAsync: vi.fn(),
  setItemAsync: vi.fn(),
}));

vi.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: vi.fn(),
  MediaTypeOptions: {
    All: 'All',
    Images: 'Images',
    Videos: 'Videos',
  },
}));

vi.mock('expo-image-manipulator', () => ({
  FlipType: {},
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

vi.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: {},
  impactAsync: vi.fn(),
  NotificationFeedbackType: {},
  notificationAsync: vi.fn(),
  selectionAsync: vi.fn(),
}));

// Mock Clerk
vi.mock('@clerk/clerk-expo', () => ({
  ClerkProvider: vi.fn(({ children }) => children),
  useAuth: vi.fn(() => ({
    isLoaded: true,
    isSignedIn: false,
    signOut: vi.fn(),
  })),
  useSignIn: vi.fn(() => ({
    isLoaded: true,
    setActive: vi.fn(),
    signIn: { create: vi.fn() },
  })),
  useSSO: vi.fn(() => ({
    startSSOFlow: vi.fn(),
  })),
  useUser: vi.fn(() => ({
    isLoaded: true,
    user: null,
  })),
}));

// Mock React Native with simpler implementations
vi.mock('react-native', () => {
  return {
    ActivityIndicator: MockActivityIndicator,
    Alert: {
      alert: vi.fn(),
    },
    Animated: {
      timing: vi.fn(() => ({
        start: (callback?: () => void) => callback?.(),
      })),
      Value: MockAnimatedValue,
      View: MockView,
    },
    Button: MockButton,
    Image: MockImage,
    Platform: {
      OS: 'ios',
      select: vi.fn(
        (options: Record<string, unknown>) => options.ios || options.default,
      ),
    },
    Pressable: MockPressable,
    SafeAreaView: MockSafeAreaView,
    ScrollView: MockScrollView,
    StyleSheet: {
      create: <T extends Record<string, object>>(styles: T) => styles,
    },
    Text: MockText,
    TextInput: MockTextInput,
    TouchableOpacity: MockPressable,
    View: MockView,
  };
});
