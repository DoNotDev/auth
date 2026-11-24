'use client';
// packages/features/auth/src/emailAuth/signUpFlow.tsx

/**
 * @fileoverview Email sign-up flow
 * @description The framework's whole email sign-up, one component: account (email,
 * password, the app's fields) -> emailed code -> the app's steps -> done. Built on the
 * email auth pieces (`useEmailSignUp` in code mode, `useEmailCodeConfirmation`,
 * `AuthCodeField`, `AuthForm` + fields). Every behaviour has one setting, so none is a
 * prop: no toast (errors and "new code sent" inline), titles from i18n, step
 * transition, focus, iOS keyboard continuity, back keeps the inputs, the pending step
 * survives the host closing.
 *
 * @version 0.1.0
 * @since 0.3.4
 * @author AMBROISE PARK Consulting
 */

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, ReactNode, Ref } from 'react';

import { Button, BUTTON_VARIANT, Stack, Text } from '@donotdev/components';
import { safeSessionStorage, useTranslation } from '@donotdev/core';
import type { AuthUser, SignUpMetadata } from '@donotdev/core';

import { useAuth } from '../useAuth';
import {
  AuthCodeField,
  AuthEmailField,
  AuthForm,
  AuthFormAlerts,
  AuthPasswordField,
  AuthSubmitButton,
} from './fields';
import { useEmailCodeConfirmation, useEmailSignUp } from './flows';
import { isEmail } from './rules';

/** Step of the flow: `'account'`, `'code'`, or the `id` of an app step. */
export type EmailSignUpStepId = 'account' | 'code' | (string & {});

/** What an app step receives. */
export interface EmailSignUpStepContext {
  /** The signed-in user (the code confirmed the address) */
  user: AuthUser;
  /** To the following app step; after the last one, `onDone` */
  next: () => void;
  /** To the previous app step; absent on the first one (the account exists by then) */
  back?: () => void;
}

/** An app step, shown once the user is signed in (e.g. company details). */
export interface EmailSignUpStep {
  /** Step id, reported by `onStepChange` and kept across the host closing */
  id: string;
  /** Title the flow renders above the step (translated by the app) */
  title: string;
  /** Text under the title */
  description?: ReactNode;
  /** The step's content */
  render: (context: EmailSignUpStepContext) => ReactNode;
}

/** Props of {@link EmailSignUpFlow}. */
export interface EmailSignUpFlowProps {
  /**
   * App fields, rendered inside the account form after the password (read at submit
   * like the framework fields): e.g. `<AuthNameField />`, `<AuthConsentField />`, a
   * privacy link.
   */
  fields?: ReactNode;
  /** Extra sign-up metadata stored with the user (e.g. `{ locale }`) */
  metadata?: SignUpMetadata;
  /** App steps after the code, in order */
  steps?: EmailSignUpStep[];
  /** Called with each step shown, the first one included (e.g. a link only on `'account'`) */
  onStepChange?: (step: EmailSignUpStepId) => void;
  /** Called with the signed-in user once the last step is done: close the host here */
  onDone?: (user: AuthUser) => void;
}

/** Session storage key of the pending step (never the password). */
export const SIGN_UP_FLOW_STORAGE_KEY = 'dndev.auth.signUp';

/** What survives the host closing: the step, and the address awaiting its code. */
interface PendingSignUp {
  step: string;
  email?: string;
}

/** The stored pending step (browser storage: untrusted), or `null`. */
function readPending(): PendingSignUp | null {
  const raw = safeSessionStorage.getItem(SIGN_UP_FLOW_STORAGE_KEY);
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { step, email } = value as Record<string, unknown>;
    if (typeof step !== 'string' || step === 'account') return null;
    if (email !== undefined && (typeof email !== 'string' || !isEmail(email))) {
      return null;
    }
    if (step === 'code' && email === undefined) return null;
    return email === undefined ? { step } : { step, email };
  } catch {
    return null;
  }
}

const writePending = (pending: PendingSignUp | null): void => {
  if (pending === null) safeSessionStorage.removeItem(SIGN_UP_FLOW_STORAGE_KEY);
  else
    safeSessionStorage.setItem(
      SIGN_UP_FLOW_STORAGE_KEY,
      JSON.stringify(pending)
    );
};

/**
 * Forgets a pending post-sign-in return path (`dndev.auth.returnTo`, saved by the
 * route guard, or `?returnTo=` from the server redirect) so the sign-in that ends a
 * sign-up does not navigate away (AuthReturnTo, @donotdev/ui).
 */
function dropPendingReturnTo(): void {
  safeSessionStorage.removeItem('dndev.auth.returnTo');
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (!url.searchParams.has('returnTo')) return;
  url.searchParams.delete('returnTo');
  window.history.replaceState(window.history.state, '', url);
}

/** Which side the entering step comes from. */
type Direction = 'forward' | 'back';

const motionAllowed = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Touch device: the on-screen keyboard only opens from a focus inside a tap. */
const coarsePointer = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

/**
 * The keyboard proxy: focusable, invisible, out of the accessibility tree, at least
 * 16px so iOS does not zoom on its focus.
 */
const KEYBOARD_PROXY_STYLE = { fontSize: 'var(--font-size-input)' } as const;

/** Heading + description + "Step n of N" of a step, rendered by the flow. */
function StepHeader({
  titleId,
  titleRef,
  title,
  description,
  position,
  total,
}: {
  titleId: string;
  titleRef?: Ref<HTMLElement>;
  title: string;
  description?: ReactNode;
  position: number;
  total: number;
}) {
  const { t } = useTranslation('auth');
  return (
    <Stack gap="tight">
      <Text as="p" level="caption" variant="muted">
        {t('signUpFlow.progress', {
          defaultValue: `Step ${position} of ${total}`,
          current: position,
          total,
        })}
      </Text>
      <Text as="h2" level="h3" id={titleId} ref={titleRef} tabIndex={-1}>
        {title}
      </Text>
      {description !== undefined && <Text variant="muted">{description}</Text>}
    </Stack>
  );
}

/** The code step: the code field and "Change address". */
function CodeStep({
  email,
  onConfirmed,
  onChangeEmail,
}: {
  email: string;
  onConfirmed: (user: AuthUser) => void;
  onChangeEmail: () => void;
}) {
  const { t } = useTranslation('auth');
  const confirmation = useEmailCodeConfirmation({
    email,
    onSuccess: onConfirmed,
  });
  return (
    <Stack>
      <AuthCodeField confirmation={confirmation} />
      <Button
        type="button"
        variant={BUTTON_VARIANT.LINK}
        onClick={onChangeEmail}
      >
        {t('codeConfirmation.change_email', { defaultValue: 'Change address' })}
      </Button>
    </Stack>
  );
}

/**
 * The whole email sign-up: account (email, password, `fields`) -> 6-digit emailed
 * code -> `steps` -> `onDone(user)`. Inline only, no toast. The flow renders each
 * step's title, description and "Step n of N"; the host renders nothing per step.
 *
 * - Password: minimum length + breached-password check, no composition rules.
 * - "Change address" goes back to the account form with every input as typed.
 * - The step (and the address awaiting its code, never the password) is kept in
 *   session storage: closing and reopening the host resumes it; a reload too.
 * - Signed in when it mounts (e.g. a sign-up left after the code): the first app step
 *   (or the stored one), or `onDone` at once when there are none.
 * - Forward slides in from the end side, back from the start side (RTL mirrored); no
 *   slide under reduced motion. Each change scrolls the step to the top and focuses
 *   its title; the code step focuses the code input.
 * - Touch devices: the submit tap focuses a hidden input, so the keyboard is already
 *   open when the code input takes the focus (iOS opens it only from a tap).
 *
 * Needs a provider with `verifyEmailCode` (Supabase) and a confirmation email that
 * sends the 6-digit code.
 *
 * @param props - EmailSignUpFlowProps
 * @returns The flow
 *
 * @example
 * ```tsx
 * <EmailSignUpFlow
 *   fields={<AuthNameField />}
 *   metadata={{ locale: i18n.language }}
 *   steps={[{ id: 'company', title: t('company.title'), render: ({ next }) => <Company onSaved={next} /> }]}
 *   onDone={close}
 * />
 * ```
 */
export function EmailSignUpFlow({
  fields,
  metadata,
  steps = [],
  onStepChange,
  onDone,
}: EmailSignUpFlowProps) {
  const { t } = useTranslation('auth');
  const storeUser = useAuth('user');
  const status = useAuth('status');
  const [step, setStep] = useState<EmailSignUpStepId>('account');
  // The address awaiting its code
  const [email, setEmail] = useState<string | null>(null);
  // The stored address, for the account form remounted after the host closed
  const [restoredEmail, setRestoredEmail] = useState<string | undefined>();
  const [direction, setDirection] = useState<Direction | null>(null);
  const [confirmedUser, setConfirmedUser] = useState<AuthUser | null>(null);
  // Bumped by every step change made in the flow: scroll + focus the new step
  const [moves, setMoves] = useState(0);
  // Bumped by every submit that primed the keyboard proxy
  const [primes, setPrimes] = useState(0);
  // A restored app step waits for auth: dropped if nobody is signed in
  const [awaitingUser, setAwaitingUser] = useState(false);
  const done = useRef(false);
  // Signed in: the flow left the account / code steps (once)
  const entered = useRef(false);
  // The auth effect skips its mount run: the mount layout effect handled it
  const settled = useRef(false);
  const previousUser = useRef(storeUser);
  const proxyRef = useRef<HTMLInputElement>(null);
  const primedFrom = useRef<HTMLElement | null>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLElement>(null);
  const titleId = useId();

  const ids = new Set(steps.map((s) => s.id));
  if (ids.has('account') || ids.has('code') || ids.size !== steps.length) {
    throw new Error(
      'EmailSignUpFlow: step ids must be unique and not "account" or "code"'
    );
  }
  const appIndex = steps.findIndex((s) => s.id === step);
  const user = storeUser ?? confirmedUser;

  const finish = (signedIn: AuthUser) => {
    if (done.current) return;
    done.current = true;
    writePending(null);
    onDone?.(signedIn);
  };

  const go = (
    next: EmailSignUpStepId,
    side: Direction,
    codeEmail: string | null = email
  ) => {
    setStep(next);
    setDirection(motionAllowed() ? side : null);
    setMoves((n) => n + 1);
    if (next === 'account') writePending(null);
    else if (next === 'code' && codeEmail !== null) {
      writePending({ step: next, email: codeEmail });
    } else writePending({ step: next });
    onStepChange?.(next);
  };

  const signedIn = (signedInUser: AuthUser) => {
    if (entered.current) return;
    entered.current = true;
    const first = steps[0];
    if (first) go(first.id, 'forward');
    else finish(signedInUser);
  };

  // Mount: resume the stored step (before paint: no flash of the account form).
  useLayoutEffect(() => {
    const pending = readPending();
    const stored = pending && ids.has(pending.step) ? pending.step : null;
    let initial: EmailSignUpStepId = 'account';
    if (storeUser) {
      entered.current = true;
      const first = steps[0];
      if (stored) initial = stored;
      else if (first) {
        initial = first.id;
        writePending({ step: first.id });
      } else {
        finish(storeUser);
        return;
      }
    } else if (pending?.step === 'code' && pending.email) {
      setEmail(pending.email);
      setRestoredEmail(pending.email);
      initial = 'code';
    } else if (stored) {
      initial = stored;
      setAwaitingUser(true);
    } else if (pending) writePending(null);
    if (initial !== 'account') setStep(initial);
    onStepChange?.(initial);
    // Mount only: later changes go through `go`.
  }, []);

  // Auth changes after mount: signed in elsewhere / at once, or signed out.
  useEffect(() => {
    const before = previousUser.current;
    previousUser.current = storeUser;
    if (!settled.current) {
      settled.current = true;
      return;
    }
    if (storeUser) {
      if (awaitingUser) setAwaitingUser(false);
      if (step === 'account' || step === 'code') signedIn(storeUser);
      return;
    }
    const signedOut = before !== null && before !== undefined;
    if ((signedOut || (awaitingUser && status === 'ready')) && appIndex >= 0) {
      setAwaitingUser(false);
      setConfirmedUser(null);
      entered.current = false;
      done.current = false;
      go('account', 'back');
    }
  }, [storeUser, status, awaitingUser]);

  // A step change: the step at the top, its title focused; the code input on the code step.
  useLayoutEffect(() => {
    if (moves === 0) return;
    const root = activeRef.current;
    if (!root) return;
    root.scrollIntoView?.({ block: 'start' });
    const target =
      step === 'code' ? root.querySelector('input') : titleRef.current;
    target?.focus({ preventScroll: true });
  }, [moves]);

  const signUp = useEmailSignUp({
    confirmation: 'code',
    passwordComposition: false,
    metadata,
    onSuccess: ({ awaitingConfirmation, email: address }) => {
      setEmail(address);
      // The sign-in that ends this sign-up (code step) must not navigate: the visitor
      // stays where they were and the app steps follow in place.
      dropPendingReturnTo();
      // Not awaiting: signed in at once (no confirmation); the auth effect moves on.
      if (awaitingConfirmation) go('code', 'forward', address);
    },
  });

  // The submit tap focuses the proxy (keyboard opens inside the gesture); the code
  // input takes the focus over once the code step shows.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (coarsePointer() && proxyRef.current) {
      primedFrom.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      proxyRef.current.focus({ preventScroll: true });
      setPrimes((n) => n + 1);
    }
    signUp.onSubmit(event);
  };

  // The submit did not reach the code step (invalid field, throttle, provider error):
  // focus leaves the proxy for the invalid field, else where it was, else nowhere.
  useEffect(() => {
    const proxy = proxyRef.current;
    if (!proxy || document.activeElement !== proxy) return;
    if (signUp.busy || step !== 'account') return;
    const invalid = accountRef.current?.querySelector<HTMLElement>(
      '[aria-invalid="true"]'
    );
    const from = primedFrom.current;
    primedFrom.current = null;
    if (invalid) invalid.focus();
    else if (from?.isConnected && from !== proxy) from.focus();
    else proxy.blur();
  }, [primes, signUp.busy, signUp.fieldErrors, signUp.error, step]);

  const total = 2 + steps.length;
  const motion =
    direction === null
      ? undefined
      : direction === 'forward'
        ? 'dndev-animate-step-forward'
        : 'dndev-animate-step-back';
  const onAccount = step === 'account';
  const appStep = appIndex >= 0 ? steps[appIndex] : undefined;
  const previousStep = appIndex > 0 ? steps[appIndex - 1] : undefined;

  return (
    <Stack>
      {/* Mounted until signed in: "Change address" finds every input as typed. */}
      {!appStep && (
        <div
          ref={(el) => {
            accountRef.current = el;
            if (onAccount) activeRef.current = el;
          }}
          hidden={!onAccount}
          role="group"
          aria-labelledby={onAccount ? titleId : undefined}
          className={onAccount ? motion : undefined}
        >
          <Stack>
            {onAccount && (
              <StepHeader
                titleId={titleId}
                titleRef={titleRef}
                title={t('signUpFlow.account_title', {
                  defaultValue: 'Create your account',
                })}
                position={1}
                total={total}
              />
            )}
            <AuthForm flow={{ ...signUp, onSubmit }}>
              <AuthEmailField defaultValue={restoredEmail} />
              <AuthPasswordField />
              {fields}
              <AuthFormAlerts />
              <AuthSubmitButton />
            </AuthForm>
          </Stack>
        </div>
      )}
      {step === 'code' && email !== null && (
        <div
          ref={activeRef}
          role="group"
          aria-labelledby={titleId}
          className={motion}
        >
          <Stack>
            <StepHeader
              titleId={titleId}
              titleRef={titleRef}
              title={t('signUpFlow.code_title', {
                defaultValue: 'Check your email',
              })}
              description={t('codeConfirmation.intro', {
                defaultValue: `Enter the code sent to ${email}`,
                email,
              })}
              position={2}
              total={total}
            />
            <CodeStep
              email={email}
              onConfirmed={(confirmed) => {
                setConfirmedUser(confirmed);
                signedIn(confirmed);
              }}
              onChangeEmail={() => go('account', 'back')}
            />
          </Stack>
        </div>
      )}
      {appStep && (
        <div
          key={appStep.id}
          ref={activeRef}
          role="group"
          aria-labelledby={titleId}
          className={motion}
        >
          <Stack>
            <StepHeader
              titleId={titleId}
              titleRef={titleRef}
              title={appStep.title}
              description={appStep.description}
              position={3 + appIndex}
              total={total}
            />
            {user &&
              appStep.render({
                user,
                next: () => {
                  const following = steps[appIndex + 1];
                  if (following) go(following.id, 'forward');
                  else finish(user);
                },
                ...(previousStep
                  ? { back: () => go(previousStep.id, 'back') }
                  : {}),
              })}
          </Stack>
        </div>
      )}
      <input
        ref={proxyRef}
        type="text"
        inputMode="numeric"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        className="dndev-sr-only"
        style={KEYBOARD_PROXY_STYLE}
      />
    </Stack>
  );
}
