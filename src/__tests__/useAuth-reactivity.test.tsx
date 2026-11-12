import { act, render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { AuthUser } from '@donotdev/core';

import { useAuthStore } from '../AuthStore';
import { useAuth } from '../useAuth';

/**
 * Fake provider shaped like SupabaseAuth: the provider owns the store update,
 * driven only by its auth-state listener (signIn itself never touches the store).
 */
type Store = ReturnType<typeof useAuthStore.getState>;
const provider = {
  store: null as Store | null,
  listeners: new Set<(u: AuthUser | null) => void>(),
  setStore(s: Store) {
    this.store = s;
  },
  async initialize() {
    this.store?.setUnauthenticated();
  },
  onAuthStateChanged(cb: (u: AuthUser | null) => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  },
  /** What the backend does on a live sign-in (e.g. Supabase SIGNED_IN). */
  emitSignIn(user: AuthUser) {
    if (this.listeners.size === 0) return;
    this.store?.setAuthenticated(user, {} as never, { role: user.role } as never);
    this.listeners.forEach((cb) => cb(user));
  },
};

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  return {
    ...actual,
    isClient: () => true,
    hasProvider: (name: string) => name === 'auth',
    getProvider: () => provider,
  };
});

const ADMIN = { required: true, role: 'admin' } as const;

function Initialiser() {
  useAuth('status');
  return null;
}

function Gate() {
  const can = useAuth('can');
  return <span>{can.navigate(ADMIN) ? 'dashboard' : 'gate'}</span>;
}

const flush = () => act(async () => {});

describe('useAuth reactivity', () => {
  beforeEach(() => {
    useAuthStore.getState().setUnauthenticated();
  });

  it('keeps the auth listener after the component that initialised auth unmounts, and re-renders can', async () => {
    // App start: the provider has not initialised yet.
    useAuthStore.setState({ status: 'initializing' as never });
    const first = render(<Initialiser />);
    await flush();
    expect(provider.listeners.size).toBe(1);

    first.unmount();
    expect(provider.listeners.size).toBe(1);

    render(<Gate />);
    expect(screen.getByText('gate')).toBeTruthy();

    act(() => {
      provider.emitSignIn({ id: 'u1', email: 'a@b.c', role: 'super' } as AuthUser);
    });
    expect(screen.getByText('dashboard')).toBeTruthy();

    act(() => {
      useAuthStore.getState().setUnauthenticated();
    });
    expect(screen.getByText('gate')).toBeTruthy();
  });

  it('returns the same can object while the auth state is unchanged', async () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useAuth('can'));
      return null;
    }
    const { rerender } = render(<Probe />);
    await flush();
    rerender(<Probe />);
    expect(seen.at(-1)).toBe(seen.at(-2));
  });
});
