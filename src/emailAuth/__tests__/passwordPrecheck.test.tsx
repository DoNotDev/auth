// packages/features/auth/src/emailAuth/__tests__/passwordPrecheck.test.tsx

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AuthEmailField,
  AuthForm,
  AuthNameField,
  AuthPasswordField,
  AuthSubmitButton,
} from '../fields';
import { BREACH_PRECHECK_DEBOUNCE_MS, useEmailSignUp } from '../flows';

const api = {
  isAvailable: true,
  status: 'ready',
  createUserWithEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(),
};

vi.mock('../../useAuth', () => ({
  useAuth: (key: keyof typeof api) => api[key],
}));

const isBreachedPassword = vi.fn<(password: string) => Promise<boolean>>();
vi.mock('../rules', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../rules')>();
  return {
    ...actual,
    isBreachedPassword: (password: string) => isBreachedPassword(password),
  };
});

vi.mock('@donotdev/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@donotdev/core')>();
  const { localeT } = await import('./localeT');
  return {
    ...actual,
    useAppConfig: () => undefined,
    useTranslation: (namespace?: string | string[]) => ({
      t: localeT(namespace),
      i18n: { language: 'en' },
    }),
  };
});

const STRONG = 'Str0ng!pass';
const STRONG_2 = 'Str0ng!pass2';
const BREACHED_MESSAGE = /appeared in a data breach/;

function SignUp({ composition }: { composition?: boolean }) {
  const flow = useEmailSignUp({ passwordComposition: composition });
  return (
    <AuthForm flow={flow}>
      <AuthNameField />
      <AuthEmailField />
      <AuthPasswordField />
      <AuthSubmitButton />
    </AuthForm>
  );
}

const typePassword = (value: string) =>
  fireEvent.input(screen.getByLabelText(/^Password$/), { target: { value } });

const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  isBreachedPassword.mockResolvedValue(false);
  api.createUserWithEmail.mockResolvedValue({
    success: true,
    user: { emailVerified: false },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('password strength slot', () => {
  it('is mounted before the first keystroke, with the checklist too', () => {
    render(<SignUp />);
    expect(screen.getByText(/Password strength/)).toBeTruthy();
    expect(screen.getByText(/Password requirements/)).toBeTruthy();
  });

  it('has the same structure idle and typed (no layout shift)', () => {
    render(<SignUp />);
    const structure = () =>
      document.querySelector('.dndev-password-strength')?.querySelectorAll('*')
        .length;
    const idle = structure();
    typePassword(STRONG);
    expect(structure()).toBe(idle);
  });

  it('without the composition checklist: the strength meter slot is still mounted', () => {
    render(<SignUp composition={false} />);
    expect(screen.getByText(/Password strength/)).toBeTruthy();
    expect(screen.queryByText(/Password requirements/)).toBeNull();
  });
});

describe('breached-password pre-check', () => {
  it('starts only after typing stopped for the debounce', async () => {
    render(<SignUp />);
    typePassword(STRONG);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS - 1);
    expect(isBreachedPassword).not.toHaveBeenCalled();
    typePassword(STRONG_2);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS - 1);
    expect(isBreachedPassword).not.toHaveBeenCalled();
    await advance(1);
    expect(isBreachedPassword).toHaveBeenCalledTimes(1);
    expect(isBreachedPassword).toHaveBeenCalledWith(STRONG_2);
  });

  it('does not run while the password is not strong enough', async () => {
    render(<SignUp />);
    typePassword('abc');
    await advance(BREACH_PRECHECK_DEBOUNCE_MS * 3);
    expect(isBreachedPassword).not.toHaveBeenCalled();
  });

  it('a breached password shows the field error right away, no submit', async () => {
    isBreachedPassword.mockResolvedValue(true);
    render(<SignUp />);
    typePassword(STRONG);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS);
    expect(screen.getByRole('alert').textContent).toMatch(BREACHED_MESSAGE);
    expect(api.createUserWithEmail).not.toHaveBeenCalled();
  });

  it('editing the password clears the breached error', async () => {
    isBreachedPassword.mockResolvedValue(true);
    render(<SignUp />);
    typePassword(STRONG);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS);
    typePassword('short');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ignores the answer for a password that is no longer the current one', async () => {
    let answerFirst: (breached: boolean) => void = () => undefined;
    isBreachedPassword.mockImplementation((password) =>
      password === STRONG
        ? new Promise<boolean>((resolve) => {
            answerFirst = resolve;
          })
        : Promise.resolve(false)
    );
    render(<SignUp />);
    typePassword(STRONG);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS);
    typePassword(STRONG_2);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS);
    await act(async () => answerFirst(true));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('submit reuses the cached result for the same password', async () => {
    render(<SignUp />);
    fireEvent.change(screen.getByLabelText(/^Email$/), {
      target: { value: 'a@b.co' },
    });
    typePassword(STRONG);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS);
    expect(isBreachedPassword).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
    });
    expect(isBreachedPassword).toHaveBeenCalledTimes(1);
    expect(api.createUserWithEmail).toHaveBeenCalledTimes(1);
  });

  it('submit before the debounce ends runs the check itself, once', async () => {
    render(<SignUp />);
    fireEvent.change(screen.getByLabelText(/^Email$/), {
      target: { value: 'a@b.co' },
    });
    typePassword(STRONG);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
    });
    await advance(BREACH_PRECHECK_DEBOUNCE_MS * 2);
    expect(isBreachedPassword).toHaveBeenCalledTimes(1);
    expect(api.createUserWithEmail).toHaveBeenCalledTimes(1);
  });

  it('submit checks again when the password differs from the cached one', async () => {
    render(<SignUp />);
    fireEvent.change(screen.getByLabelText(/^Email$/), {
      target: { value: 'a@b.co' },
    });
    typePassword(STRONG);
    await advance(BREACH_PRECHECK_DEBOUNCE_MS);
    typePassword(STRONG_2);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
    });
    expect(isBreachedPassword).toHaveBeenCalledTimes(2);
    expect(isBreachedPassword).toHaveBeenLastCalledWith(STRONG_2);
  });
});

describe('inputs while a submit runs', () => {
  it('stay enabled (read-only), values kept; the button shows busy', async () => {
    api.createUserWithEmail.mockReturnValue(new Promise(() => undefined));
    render(<SignUp />);
    fireEvent.change(screen.getByLabelText(/^Email$/), {
      target: { value: 'a@b.co' },
    });
    typePassword(STRONG);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create account$/ }));
    });
    for (const label of [/^Email$/, /^Name$/, /^Password$/]) {
      const input = screen.getByLabelText(label) as HTMLInputElement;
      expect(input.disabled).toBe(false);
      expect(input.readOnly).toBe(true);
    }
    expect((screen.getByLabelText(/^Email$/) as HTMLInputElement).value).toBe(
      'a@b.co'
    );
    const button = screen.getByRole('button', { name: /^Create account$/ });
    expect(button.getAttribute('aria-busy')).toBe('true');
  });
});
