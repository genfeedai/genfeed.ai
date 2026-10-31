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
  accessibilityLabel,
  accessibilityRole,
  accessibilityState,
  children,
  onPress,
  style: _style,
  ...props
}: PrimitiveProps & {
  accessibilityLabel?: string;
  accessibilityRole?: string;
  accessibilityState?: {
    checked?: boolean;
    disabled?: boolean;
  };
  children?: ReactNode | ((state: PressState) => ReactNode);
  onPress?: () => void;
}) {
  const content =
    typeof children === 'function' ? children({ pressed: false }) : children;

  return React.createElement(
    'button',
    {
      ...props,
      'aria-checked': accessibilityState?.checked,
      'aria-disabled': accessibilityState?.disabled,
      'aria-label': accessibilityLabel,
      onClick: onPress,
      role: accessibilityRole,
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

// Mock Expo modules
vi.mock('expo-router', () => ({
  DarkTheme: {
    colors: {},
    dark: true,
  },
  DefaultTheme: {
    colors: {},
    dark: false,
  },
  Link: createPrimitive('a'),
  Redirect: ({ href }: { href: string }) =>
    React.createElement('div', {
      'data-href': href,
      'data-testid': 'redirect',
    }),
  Slot: createPrimitive('div'),
  Stack: MockStack,
  Tabs: MockTabs,
  ThemeProvider: ({
    children,
    value,
  }: {
    children?: ReactNode;
    value?: { dark?: boolean };
  }) =>
    React.createElement(
      'div',
      {
        'data-dark': String(value?.dark),
        'data-testid': 'navigation-theme',
      },
      children,
    ),
  useLocalSearchParams: vi.fn(() => ({})),
  useRouter: vi.fn(() => ({
    back: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  })),
}));

vi.mock('expo-status-bar', () => ({
  StatusBar: ({ style }: { style?: string }) =>
    React.createElement('div', {
      'data-style': style,
      'data-testid': 'status-bar',
    }),
}));

vi.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(),
    setItem: vi.fn(),
  },
}));

vi.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: vi.fn(),
}));

vi.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: vi.fn(() => [
    { clientId: 'google-client' },
    null,
    vi.fn().mockResolvedValue({ type: 'cancel' }),
  ]),
}));

vi.mock('expo-splash-screen', () => ({
  hideAsync: vi.fn().mockResolvedValue(undefined),
  preventAutoHideAsync: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('expo-font', () => ({
  useFonts: vi.fn(() => [true, null]),
}));

vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiUrl: 'https://api.test.com',
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

vi.mock('react-native-reanimated', () => ({
  default: {
    View: MockView,
  },
  useAnimatedStyle: (callback: () => object) => callback(),
  useSharedValue: (value: unknown) => ({ value }),
  withTiming: (value: unknown) => value,
}));

vi.mock('@/contexts/auth-context', () => ({
  MobileAuthProvider: vi.fn(({ children }) => children),
  useMobileAuth: vi.fn(() => ({
    getToken: vi.fn().mockResolvedValue(null),
    isLoaded: true,
    isSignedIn: false,
    refreshSession: vi.fn(),
    signInWithEmail: vi.fn(),
    signInWithGoogleIdToken: vi.fn(),
    signOut: vi.fn(),
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
    Appearance: {
      setColorScheme: vi.fn(),
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
    useColorScheme: vi.fn(() => 'dark'),
  };
});
