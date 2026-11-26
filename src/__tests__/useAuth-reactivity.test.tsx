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

  it('skips a same-user re-emit with equal data: references kept, no extra render', async () => {
    const mk = () =>
      ({ id: 'u2', email: 'a@b.c', role: 'user', customClaims: { tier: 'free' } }) as AuthUser;
    let userRenders = 0;
    let canRenders = 0;
    function UserProbe() {
      useAuth('user');
      userRenders++;
      return null;
    }
    function CanProbe() {
      useAuth('can');
      canRenders++;
      return null;
    }
    render(
      <>
        <Initialiser />
        <UserProbe />
        <CanProbe />
      </>
    );
    await flush();

    act(() => {
      provider.emitSignIn(mk());
    });
    const s1 = useAuthStore.getState();
    const [u, sub, prof] = [s1.user, s1.userSubscription, s1.userProfile];
    const [ur, cr] = [userRenders, canRenders];

    act(() => {
      provider.emitSignIn(mk());
    });
    const s2 = useAuthStore.getState();
    expect(s2.user).toBe(u);
    expect(s2.userSubscription).toBe(sub);
    expect(s2.userProfile).toBe(prof);
    expect(userRenders).toBe(ur);
    expect(canRenders).toBe(cr);
  });

  it('updates the store and re-renders when the same user re-emits with changed claims', async () => {
    const mk = (tier: string) =>
      ({ id: 'u3', email: 'a@b.c', role: 'user', customClaims: { tier } }) as AuthUser;
    const seen: unknown[] = [];
    function UserProbe() {
      seen.push(useAuth('user'));
      return null;
    }
    render(
      <>
        <Initialiser />
        <UserProbe />
      </>
    );
    await flush();

    act(() => {
      provider.emitSignIn(mk('free'));
    });
    const before = useAuthStore.getState().user;
    const renders = seen.length;

    act(() => {
      provider.emitSignIn(mk('pro'));
    });
    const after = useAuthStore.getState().user;
    expect(after).not.toBe(before);
    expect(after?.customClaims).toEqual({ tier: 'pro' });
    expect(seen.length).toBeGreaterThan(renders);
    expect((seen.at(-1) as AuthUser).customClaims).toEqual({ tier: 'pro' });
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
