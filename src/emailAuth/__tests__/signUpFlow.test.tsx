// packages/features/auth/src/emailAuth/__tests__/signUpFlow.test.tsx

import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthNameField } from '../fields';
import { EmailSignUpFlow, SIGN_UP_FLOW_STORAGE_KEY } from '../signUpFlow';
import type { EmailSignUpFlowProps, EmailSignUpStep } from '../signUpFlow';

const signedInUser = { id: 'u1', email: 'pro@b.co', emailVerified: true };

const api: Record<string, unknown> = {
  isAvailable: true,
  status: 'ready',
  user: null,
  createUserWithEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  verifyEmailCode: vi.fn(),
  canRememberMe: vi.fn(() => false),
};

vi.mock('../../useAuth', () => ({
  useAuth: (key: string) => api[key],
}));

const toast = vi.fn();
vi.mock('@donotdev/components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/components')>();
  return { ...actual, toast: (...args: unknown[]) => toast(...args) };
});

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  const { localeT } = await import('./localeT');
  return {
    ...actual,
    useAppConfig: () => undefined,
    useTranslation: (namespace?: string | string[]) => ({
      t: localeT(namespace),
      i18n: { language: 'fr' },
      language: 'fr',
    }),
  };
});

// No network in tests: the breached-password API answers "not found".
vi.stubGlobal(
  'fetch',
  vi.fn(async () => new Response('', { status: 200 }))
);

/** matchMedia answering `matches` for the given queries. */
const media = (matching: string[]) => {
  window.matchMedia = ((query: string) => ({
    matches: matching.includes(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
};

const type = (label: RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const companyStep = (render = vi.fn(() => <span>company form</span>)) =>
  ({ id: 'company', title: 'Your company', render }) satisfies EmailSignUpStep;

/** Fills the account step and submits; resolves once the provider was called. */
const submitAccount = async (name?: string) => {
  type(/^Email$/, ' pro@b.co ');
  type(/^Password$/, 'longenough1');
  if (name !== undefined) type(/^Name$/, name);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
  });
  await waitFor(() => expect(api.createUserWithEmail).toHaveBeenCalled());
  await act(async () => {});
};

const typeCode = async (code = '123456') => {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Confirmation code'), {
      target: { value: code },
    });
  });
  await act(async () => {});
};

const renderFlow = (props: EmailSignUpFlowProps = {}) =>
  render(<EmailSignUpFlow {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  api.user = null;
  api.status = 'ready';
  (api.createUserWithEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
    success: true,
    user: { emailVerified: false },
  });
  (api.verifyEmailCode as ReturnType<typeof vi.fn>).mockResolvedValue(
    signedInUser
  );
  media([]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('EmailSignUpFlow', () => {
  it('runs account -> code -> app step -> done, with titles and no toast', async () => {
    const onStepChange = vi.fn();
    const onDone = vi.fn();
    const company = companyStep(
      vi.fn(({ next }: { next: () => void }) => (
        <button type="button" onClick={next}>
          save company
        </button>
      ))
    );
    renderFlow({ steps: [company], onStepChange, onDone });

    expect(
      screen.getByRole('heading', { name: 'Create your account' })
    ).toBeTruthy();
    expect(screen.getByText('Step 1 of 3')).toBeTruthy();

    await submitAccount();
    expect(
      screen.getByRole('heading', { name: 'Check your email' })
    ).toBeTruthy();
    expect(screen.getByText('Step 2 of 3')).toBeTruthy();
    expect(screen.getByText('Enter the code sent to pro@b.co')).toBeTruthy();

    await typeCode();
    expect(api.verifyEmailCode).toHaveBeenCalledWith('pro@b.co', '123456');
    expect(screen.getByRole('heading', { name: 'Your company' })).toBeTruthy();
    expect(screen.getByText('Step 3 of 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'save company' }));
    expect(onDone).toHaveBeenCalledWith(signedInUser);
    expect(onStepChange.mock.calls.map(([s]) => s)).toEqual([
      'account',
      'code',
      'company',
    ]);
    expect(toast).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(SIGN_UP_FLOW_STORAGE_KEY)).toBeNull();
  });

  it('passes the app fields and metadata to the sign-up', async () => {
    renderFlow({ fields: <AuthNameField />, metadata: { locale: 'fr' } });
    await submitAccount(' Ana ');
    expect(api.createUserWithEmail).toHaveBeenCalledWith(
      'pro@b.co',
      'longenough1',
      {
        locale: 'fr',
        full_name: 'Ana',
      }
    );
  });

  it('applies no composition rules (length + breached check only)', async () => {
    renderFlow();
    await submitAccount();
    expect(screen.queryByText(/uppercase/i)).toBeNull();
    expect(api.createUserWithEmail).toHaveBeenCalled();
  });

  it('"Change address" goes back with every input as typed', async () => {
    renderFlow({ fields: <AuthNameField /> });
    await submitAccount('Ana');
    fireEvent.click(screen.getByRole('button', { name: 'Change address' }));

    expect(
      screen.getByRole('heading', { name: 'Create your account' })
    ).toBeTruthy();
    // type="email" sanitizes the value (spaces stripped): as the browser holds it.
    expect((screen.getByLabelText(/^Email$/) as HTMLInputElement).value).toBe(
      'pro@b.co'
    );
    expect(
      (screen.getByLabelText(/^Password$/) as HTMLInputElement).value
    ).toBe('longenough1');
    expect((screen.getByLabelText(/^Name$/) as HTMLInputElement).value).toBe(
      'Ana'
    );
    expect(sessionStorage.getItem(SIGN_UP_FLOW_STORAGE_KEY)).toBeNull();
  });

  it('gives app steps the signed-in user, next and back (not on the first)', async () => {
    const first = vi.fn(({ next }: { next: () => void }) => (
      <button type="button" onClick={next}>
        first next
      </button>
    ));
    const second = vi.fn(({ back }: { back?: () => void }) => (
      <button type="button" onClick={back}>
        second back
      </button>
    ));
    renderFlow({
      steps: [
        { id: 'one', title: 'One', render: first },
        { id: 'two', title: 'Two', render: second },
      ],
    });
    await submitAccount();
    await typeCode();

    expect(first).toHaveBeenLastCalledWith(
      expect.objectContaining({
        user: signedInUser,
        next: expect.any(Function),
      })
    );
    expect(first.mock.lastCall?.[0]).not.toHaveProperty('back');
    fireEvent.click(screen.getByRole('button', { name: 'first next' }));
    expect(second.mock.lastCall?.[0]).toHaveProperty('back');
    fireEvent.click(screen.getByRole('button', { name: 'second back' }));
    expect(screen.getByRole('heading', { name: 'One' })).toBeTruthy();
  });

  it('keeps the code step across the host closing, without the password', async () => {
    const view = renderFlow();
    await submitAccount();
    view.unmount();

    const stored = sessionStorage.getItem(SIGN_UP_FLOW_STORAGE_KEY) ?? '';
    expect(JSON.parse(stored)).toEqual({ step: 'code', email: 'pro@b.co' });
    expect(stored).not.toContain('longenough1');

    const onStepChange = vi.fn();
    renderFlow({ onStepChange });
    expect(
      screen.getByRole('heading', { name: 'Check your email' })
    ).toBeTruthy();
    expect(screen.getByText('Enter the code sent to pro@b.co')).toBeTruthy();
    expect(onStepChange).toHaveBeenCalledTimes(1);
    expect(onStepChange).toHaveBeenCalledWith('code');

    // "Change address" after a reopen: the stored address is in the form.
    fireEvent.click(screen.getByRole('button', { name: 'Change address' }));
    expect((screen.getByLabelText(/^Email$/) as HTMLInputElement).value).toBe(
      'pro@b.co'
    );
  });

  it('resumes a stored app step when signed in, drops it when signed out', () => {
    sessionStorage.setItem(
      SIGN_UP_FLOW_STORAGE_KEY,
      JSON.stringify({ step: 'company' })
    );
    api.user = signedInUser;
    const view = renderFlow({ steps: [companyStep()] });
    expect(screen.getByRole('heading', { name: 'Your company' })).toBeTruthy();
    view.unmount();

    api.user = null;
    renderFlow({ steps: [companyStep()] });
    expect(
      screen.getByRole('heading', { name: 'Create your account' })
    ).toBeTruthy();
    expect(sessionStorage.getItem(SIGN_UP_FLOW_STORAGE_KEY)).toBeNull();
  });

  it('ignores a tampered stored step', () => {
    sessionStorage.setItem(
      SIGN_UP_FLOW_STORAGE_KEY,
      JSON.stringify({ step: 'code', email: 'not-an-email' })
    );
    renderFlow();
    expect(
      screen.getByRole('heading', { name: 'Create your account' })
    ).toBeTruthy();
  });

  it('signed in at mount: the first app step, or onDone at once', () => {
    api.user = signedInUser;
    const view = renderFlow({ steps: [companyStep()] });
    expect(screen.getByRole('heading', { name: 'Your company' })).toBeTruthy();
    view.unmount();

    const onDone = vi.fn();
    renderFlow({ onDone });
    expect(onDone).toHaveBeenCalledWith(signedInUser);
  });

  it('slides the entering step in, forward then back', async () => {
    media([]);
    renderFlow();
    const account = screen.getByRole('group', { name: 'Create your account' });
    expect(account.className).not.toContain('dndev-animate-step');

    await submitAccount();
    const code = screen.getByRole('group', { name: 'Check your email' });
    expect(code.className).toContain('dndev-animate-step-forward');

    fireEvent.click(screen.getByRole('button', { name: 'Change address' }));
    expect(
      screen.getByRole('group', { name: 'Create your account' }).className
    ).toContain('dndev-animate-step-back');
  });

  it('does not slide under reduced motion', async () => {
    media(['(prefers-reduced-motion: reduce)']);
    renderFlow();
    await submitAccount();
    expect(
      screen.getByRole('group', { name: 'Check your email' }).className
    ).not.toContain('dndev-animate-step');
  });

  it('focuses the code input on the code step, the title on the others', async () => {
    renderFlow({ steps: [companyStep()] });
    await submitAccount();
    expect(document.activeElement).toBe(
      screen.getByLabelText('Confirmation code')
    );

    fireEvent.click(screen.getByRole('button', { name: 'Change address' }));
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Create your account' })
    );

    await submitAccount();
    await typeCode();
    expect(document.activeElement).toBe(
      screen.getByRole('heading', { name: 'Your company' })
    );
  });

  it('touch: the submit tap focuses the keyboard proxy, an invalid form gets the focus back', async () => {
    media(['(pointer: coarse)']);
    let focusedDuringRequest: Element | null = null;
    (api.createUserWithEmail as ReturnType<typeof vi.fn>).mockImplementation(
      async () => {
        focusedDuringRequest = document.activeElement;
        return { success: true, user: { emailVerified: false } };
      }
    );
    renderFlow();

    // Invalid: the focus goes to the invalid field (the keyboard stays on a field).
    type(/^Password$/, 'longenough1');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
    });
    expect(document.activeElement).toBe(screen.getByLabelText(/^Email$/));

    await submitAccount();
    expect(focusedDuringRequest).toBeInstanceOf(HTMLInputElement);
    expect(
      (focusedDuringRequest as unknown as HTMLInputElement).getAttribute(
        'aria-hidden'
      )
    ).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByLabelText('Confirmation code')
    );
  });

  it('rejects step ids that collide', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      renderFlow({ steps: [{ id: 'code', title: 'x', render: () => null }] })
    ).toThrow(/step ids/);
  });
});
