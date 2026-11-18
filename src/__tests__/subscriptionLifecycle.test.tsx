import { act, cleanup, render } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FEATURE_STATUS, SubscriptionClaimsSchema } from '@donotdev/core';
import type { SubscriptionClaims } from '@donotdev/core';
import * as v from 'valibot';

import { SupabaseAuth } from '../../../../providers/supabase/src/client/auth';
import { SupabaseServerAuthAdapter } from '../../../../providers/supabase/src/server/authAdapter';
import { useAuthStore } from '../AuthStore';
import { useAuth } from '../useAuth';

// Only suppress automatic provider bootstrap. Exercise real adapters, store and selectors.
vi.mock('@donotdev/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@donotdev/core')>(),
  isClient: () => false,
}));

function Probe() {
  const user = useAuth('user');
  const subscription = useAuth('userSubscription');
  const tier = useAuth('userTier');
  const can = useAuth('can');
  return <output>{JSON.stringify({
    id: user?.id, role: user?.role, subscription, tier,
    pro: can.navigate({ required: true, tier: 'pro' }),
  })}</output>;
}

describe('native server grant → Supabase refresh → auth access', () => {
  beforeEach(() => {
    useAuthStore.getState().setUnauthenticated();
    useAuthStore.setState({ status: FEATURE_STATUS.READY });
  });
  afterEach(cleanup);

  it('round-trips non-billing grant/revoke while preserving unrelated trusted metadata', async () => {
    const metadata: Record<string, unknown> = { role: 'user', application: { keep: true } };
    const currentUser = () => ({
      id: 'member', app_metadata: { ...metadata },
      user_metadata: { role: 'super', subscription: { tier: 'pro' }, full_name: 'Member' },
    });
    const currentSession = () => ({ user: currentUser(), access_token: 'refreshed-token' });
    const api = {
      getSession: vi.fn(async () => ({ data: { session: currentSession() }, error: null })),
      getUser: vi.fn(async () => ({ data: { user: currentUser() }, error: null })),
      refreshSession: vi.fn(async () => ({ data: { session: currentSession() }, error: null })),
      admin: {
        updateUserById: vi.fn(async (_uid: string, update: { app_metadata: Record<string, unknown> }) => {
          // Model the auth server's documented top-level metadata patch boundary.
          Object.assign(metadata, update.app_metadata);
          return { error: null };
        }),
      },
    };
    // Deliberate SDK boundary double; all framework mapping/state code remains real.
    const client = { auth: api } as unknown as SupabaseClient;
    const server = new SupabaseServerAuthAdapter(client);
    const provider = new SupabaseAuth(client);
    provider.setStore(useAuthStore.getState());
    await provider.initialize();
    const view = render(<Probe />);
    expect(view.container.textContent).toContain('"pro":false');
    expect(view.container.textContent).toContain('"role":"user"');

    const grant: SubscriptionClaims = v.parse(SubscriptionClaimsSchema, {
      tier: 'pro', status: 'active', subscriptionEnd: null,
      updatedAt: '2026-11-01T00:00:00.000Z',
    });
    await server.setCustomClaims('member', { subscription: grant });
    expect(metadata.application).toEqual({ keep: true });
    expect(metadata.subscription).toEqual(grant);
    expect(grant).not.toHaveProperty('customerId');
    expect(grant).not.toHaveProperty('subscriptionId');
    await act(async () => { expect(await provider.refreshToken()).toBe('refreshed-token'); });
    expect(view.container.textContent).toContain('"tier":"pro"');
    expect(view.container.textContent).toContain('"pro":true');
    expect(useAuthStore.getState().userSubscription).toMatchObject({ ...grant, userId: 'member', isActive: true });
    expect(await provider.hasTier('pro')).toBe(true);

    await server.setCustomClaims('member', {
      subscription: { ...grant, tier: 'free', updatedAt: '2026-11-02T00:00:00.000Z' },
    });
    // Server authority changes first; the current browser projection awaits refresh.
    expect(await provider.hasTier('pro')).toBe(false);
    expect(useAuthStore.getState().userSubscription?.tier).toBe('pro');
    await act(async () => { await provider.refreshToken(); });
    expect(view.container.textContent).toContain('"tier":"free"');
    expect(view.container.textContent).toContain('"pro":false');
    expect(useAuthStore.getState().userSubscription?.tier).toBe('free');
    expect(metadata.application).toEqual({ keep: true });
    expect(metadata.role).toBe('user');
    expect(metadata).not.toHaveProperty('tier');
    expect(api.admin.updateUserById).toHaveBeenCalledTimes(2);
  });
});
