import { act, cleanup, render } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthSessionProvider, FEATURE_STATUS } from '@donotdev/core';
import type { AuthSessionSnapshot, AuthUser, CanAPI, UserSubscription } from '@donotdev/core';

import { useAuthStore } from '../AuthStore';
import { useAuth } from '../useAuth';

// Exercise real snapshot context and hooks without starting a browser auth provider.
vi.mock('@donotdev/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@donotdev/core')>(),
  isClient: () => false,
}));

const alice: AuthUser = { id: 'alice', role: 'user' };
const bob: AuthUser = { id: 'bob', role: 'user' };
const subscription = (userId: string, tier: string): UserSubscription => ({
  userId, tier, status: 'active', subscriptionEnd: null,
  updatedAt: '2026-01-01T00:00:00.000Z', isActive: true,
});
const paid: AuthSessionSnapshot = { user: alice, userSubscription: subscription('alice', 'pro') };
const free: AuthSessionSnapshot = { user: bob, userSubscription: subscription('bob', 'free') };

function Probe({ capture }: { capture?: (can: CanAPI) => void }) {
  const user = useAuth('user');
  const profile = useAuth('userProfile');
  const sub = useAuth('userSubscription');
  const tier = useAuth('userTier');
  const role = useAuth('userRole');
  const can = useAuth('can');
  capture?.(can);
  return <span>{JSON.stringify({
    id: user?.id ?? null, profileId: profile?.userId ?? null,
    subId: sub?.userId ?? null, tier, role,
    paid: can.navigate({ tier: 'pro' }), baseline: can.navigate({ tier: 'free' }),
    authenticated: can.navigate(true), permission: can.has('documents:edit'),
  })}</span>;
}

function tree(snapshot: AuthSessionSnapshot, capture?: (can: CanAPI) => void) {
  return <AuthSessionProvider snapshot={snapshot}><Probe capture={capture} /></AuthSessionProvider>;
}

describe('useAuth request subscription state', () => {
  beforeEach(() => {
    useAuthStore.getState().setUnauthenticated();
    useAuthStore.setState({ status: FEATURE_STATUS.INITIALIZING });
  });
  afterEach(cleanup);

  it.each([
    ['paid', paid, true],
    ['free', free, false],
    ['legacy', { user: bob }, false],
    ['unknown subscription', { user: bob, userSubscription: null }, false],
    ['signed out', { user: null }, false],
  ] satisfies [string, AuthSessionSnapshot, boolean][])(
    'renders and hydrates the same %s state without seeding the auth store',
    async (_label, snapshot, hasPaidAccess) => {
    const before = useAuthStore.getState();
    const html = renderToString(tree(snapshot));
    expect(html).toContain(`&quot;paid&quot;:${hasPaidAccess}`);
    expect(useAuthStore.getState()).toBe(before);
    const container = document.createElement('div');
    container.innerHTML = html;
    const normalizedHTML = container.innerHTML;
    document.body.append(container);
    const errors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, tree(snapshot), { onRecoverableError: (error) => errors.push(error) });
    });
    expect(container.innerHTML).toBe(normalizedHTML);
    expect(errors).toEqual([]);
    expect(useAuthStore.getState()).toBe(before);
    await act(async () => root.unmount());
    container.remove();
  });

  it('isolates separate and interleaved request capabilities from each other and the singleton', () => {
    let aliceCan: CanAPI | undefined;
    let bobCan: CanAPI | undefined;
    const aliceHTML = renderToString(tree(paid, (can) => { aliceCan = can; }));
    const bobHTML = renderToString(tree(free, (can) => { bobCan = can; }));
    expect(aliceHTML).toContain('&quot;paid&quot;:true');
    expect(bobHTML).toContain('&quot;paid&quot;:false');
    render(<>{tree(paid)}{tree(free)}</>);
    act(() => {
      useAuthStore.getState().setAuthenticated(
        { id: 'unrelated-admin', role: 'admin' }, subscription('unrelated-admin', 'free'),
        { userId: 'unrelated-admin', permissions: ['documents:edit'] }
      );
    });
    expect(aliceCan?.navigate({ tier: 'pro' })).toBe(true);
    expect(bobCan?.navigate({ tier: 'pro' })).toBe(false);
    expect(aliceCan?.has('documents:edit')).toBe(false);
    expect(bobCan?.has('documents:edit')).toBe(false);
    expect(aliceCan).not.toBe(bobCan);
  });

  it('does not borrow stale store subscription or profile when an old snapshot omits subscription', () => {
    useAuthStore.setState({
      user: alice, userSubscription: subscription('alice', 'pro'),
      userProfile: { userId: 'alice', permissions: ['documents:edit'] },
    });
    const html = renderToString(tree({ user: bob }));
    expect(html).toContain('&quot;id&quot;:&quot;bob&quot;');
    expect(html).toContain('&quot;profileId&quot;:&quot;bob&quot;');
    expect(html).toContain('&quot;subId&quot;:null');
    expect(html).toContain('&quot;tier&quot;:&quot;free&quot;');
    expect(html).toContain('&quot;paid&quot;:false');
    expect(html).toContain('&quot;permission&quot;:false');
    let can: CanAPI | undefined;
    renderToString(tree({ user: bob }, (value) => { can = value; }));
    expect(can?.navigate({ validate: (_role, tier) => tier === 'pro' })).toBe(false);
  });

  it('keeps known signed-out snapshots at the free baseline even over stale paid state', () => {
    useAuthStore.setState({ user: alice, userSubscription: paid.userSubscription });
    const html = renderToString(tree({ user: null }));
    expect(html).toContain('&quot;subId&quot;:null');
    expect(html).toContain('&quot;tier&quot;:&quot;free&quot;');
    expect(html).toContain('&quot;baseline&quot;:true');
    expect(html).toContain('&quot;paid&quot;:false');
    expect(html).toContain('&quot;authenticated&quot;:false');
  });

  it('hands off to the provider store and keeps captured live capabilities fresh through refresh and sign-out', () => {
    let current: CanAPI | undefined;
    const view = render(tree(paid, (can) => { current = can; }));
    expect(view.container.textContent).toContain('"paid":true');
    act(() => {
      useAuthStore.getState().setAuthenticated(bob, subscription('bob', 'free'), { userId: 'bob' });
    });
    expect(view.container.textContent).toContain('"id":"bob"');
    expect(view.container.textContent).toContain('"paid":false');
    const liveCan = current;
    view.rerender(tree(paid, (can) => { current = can; }));
    expect(current).toBe(liveCan);
    act(() => { useAuthStore.getState().setAuthLoading(true); });
    expect(current).toBe(liveCan);
    act(() => { useAuthStore.getState().setUserSubscription(subscription('bob', 'pro')); });
    expect(view.container.textContent).toContain('"paid":true');
    expect(current).not.toBe(liveCan);
    expect(liveCan?.navigate({ tier: 'pro' })).toBe(true);
    act(() => { useAuthStore.getState().setUserSubscription(subscription('bob', 'free')); });
    expect(view.container.textContent).toContain('"paid":false');
    expect(liveCan?.navigate({ tier: 'pro' })).toBe(false);
    act(() => { useAuthStore.getState().setUnauthenticated(); });
    expect(liveCan?.navigate(true)).toBe(false);
    expect(view.container.textContent).toContain('"id":null');
  });
});
