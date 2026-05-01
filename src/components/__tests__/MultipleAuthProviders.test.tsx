import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

import MultipleAuthProviders from '../MultipleAuthProviders';

// Mock useAuth with correct selector pattern: useAuth(key) returns value
const mockSignInWithPartner = vi.fn();
vi.mock('../../useAuth', () => ({
  useAuth: (key: string) => {
    const api: Record<string, unknown> = {
      user: null,
      signInWithPartner: mockSignInWithPartner,
      linkWithPartner: vi.fn(),
      isAvailable: true,
      getPartnerState: () => 'idle',
      setPartnerState: vi.fn(),
    };
    return api[key];
  },
}));

// Mock core - isFeatureAvailable must return true for auth
vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  return {
    ...actual,
    isFeatureAvailable: () => true,
    useTranslation: () => ({
      t: (key: string) => key,
      i18n: { language: 'en' },
    }),
    getEnabledAuthPartners: () => ['google'],
  };
});

// Mock components with importOriginal to avoid missing exports
vi.mock('@donotdev/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/components')>();
  return {
    ...actual,
    Button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Stack: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Grid: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Alert: ({ children }: any) => <div>{children}</div>,
    Spinner: () => <span>loading</span>,
  };
});

// Mock account linking hook
vi.mock('../../hooks/useAccountLinking', () => ({
  useAccountLinking: () => ({
    linkedProviders: [],
    availableProviders: [],
    isLinking: false,
  }),
}));

describe('MultipleAuthProviders', () => {
  it('renders without crashing', () => {
    render(<MultipleAuthProviders providers={['google']} />);
    // Component should render partner buttons
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('renders with showLabels', () => {
    render(<MultipleAuthProviders providers={['google']} showLabels={true} />);
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});
