'use client';
// packages/features/auth/src/components/PasswordStrengthIndicator.tsx

/**
 * @fileoverview Password Strength Indicator component
 * @description Visual indicator showing password strength with requirements checklist.
 * Uses framework components exclusively - no inline styles.
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import { Check, Circle } from 'lucide-react';
import { useMemo } from 'react';

import { Progress, Stack, Text, cn } from '@donotdev/components';
import { useTranslation } from '@donotdev/core';

export interface PasswordStrengthIndicatorProps {
  /**
   * Current password value. Empty: idle state (empty bar, muted placeholder label,
   * unmet checklist) with exactly the layout of the typed state, so the slot can stay
   * mounted before the first keystroke without shifting the form when typing starts.
   */
  password: string;
  /** Minimum password length */
  minLength?: number;
  /** Whether to show requirements checklist */
  showRequirements?: boolean;
  /** Custom className */
  className?: string;
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong';

interface PasswordRequirement {
  label: string;
  met: boolean;
}

/**
 * Calculate password strength based on complexity
 */
function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) return 'weak';

  let score = 0;

  // Length check
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;

  // Character variety checks
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;

  if (score <= 2) return 'weak';
  if (score <= 4) return 'fair';
  if (score <= 5) return 'good';
  return 'strong';
}

/**
 * Get password requirements checklist
 */
function getPasswordRequirements(
  password: string,
  minLength: number,
  t: (key: string, values?: Record<string, unknown>) => string
): PasswordRequirement[] {
  return [
    {
      label: t('passwordRequirement.length', { count: minLength }),
      met: password.length >= minLength,
    },
    {
      label: t('passwordRequirement.uppercase'),
      met: /[A-Z]/.test(password),
    },
    {
      label: t('passwordRequirement.lowercase'),
      met: /[a-z]/.test(password),
    },
    {
      label: t('passwordRequirement.number'),
      met: /[0-9]/.test(password),
    },
    {
      label: t('passwordRequirement.special'),
      met: /[^a-zA-Z0-9]/.test(password),
    },
  ];
}

/** Map strength to progress percentage */
const strengthToPercent: Record<PasswordStrength, number> = {
  weak: 25,
  fair: 50,
  good: 75,
  strong: 100,
};

/** Map strength to variant for styling */
const strengthToVariant: Record<
  PasswordStrength,
  'destructive' | 'warning' | 'accent' | 'success'
> = {
  weak: 'destructive',
  fair: 'warning',
  good: 'accent',
  strong: 'success',
};

/**
 * PasswordStrengthIndicator Component
 *
 * Displays visual password strength indicator and optional requirements checklist.
 * Uses Progress component for the strength bar and Text for labels. The bar is named
 * after its visible label and announces the strength in words (`aria-valuetext`), not
 * a bare percentage.
 *
 * @component
 * @version 0.1.0
 */
export function PasswordStrengthIndicator({
  password,
  minLength = 8,
  showRequirements = true,
  className,
}: PasswordStrengthIndicatorProps) {
  const { t } = useTranslation('auth');

  const strength = useMemo(
    () => calculatePasswordStrength(password),
    [password]
  );

  const requirements = useMemo(() => {
    const translate = (key: string, values?: Record<string, unknown>) =>
      t(key, values);
    return getPasswordRequirements(password, minLength, translate);
  }, [password, minLength, t]);

  const idle = password === '';

  const strengthLabels: Record<PasswordStrength, string> = {
    weak: t('passwordStrength.weak'),
    fair: t('passwordStrength.fair'),
    good: t('passwordStrength.good'),
    strong: t('passwordStrength.strong'),
  };

  return (
    <Stack gap="tight" className={cn('dndev-password-strength', className)}>
      {/* Strength bar */}
      <Stack gap="tight">
        <Stack direction="row" align="center" justify="between" gap="tight">
          <Text as="span" level="caption" variant="muted">
            {t('passwordStrength.label')}:
          </Text>
          <Text
            as="strong"
            level="caption"
            variant={idle ? 'muted' : strengthToVariant[strength]}
          >
            {idle ? '\u2013' : strengthLabels[strength]}
          </Text>
        </Stack>
        <Progress
          aria-label={t('passwordStrength.label')}
          aria-valuetext={idle ? undefined : strengthLabels[strength]}
          value={idle ? 0 : strengthToPercent[strength]}
          variant={idle ? 'default' : strengthToVariant[strength]}
          className="dndev-password-strength-bar"
        />
      </Stack>

      {/* Requirements checklist */}
      {showRequirements && (
        <Stack gap="tight" className="dndev-password-requirements">
          <Text as="strong" level="caption" variant="muted">
            {t('passwordRequirements')}:
          </Text>
          <Stack gap="tight" data-inset="true">
            {requirements.map((req, index) => (
              <Stack
                key={index}
                direction="row"
                align="center"
                gap="tight"
                className="dndev-password-requirement-item"
              >
                {req.met ? (
                  <Check className="dndev-size-xs" data-variant="success" />
                ) : (
                  <Circle className="dndev-size-xs" data-variant="muted" />
                )}
                <Text
                  as="span"
                  level="caption"
                  variant={req.met ? 'success' : 'muted'}
                  data-opacity={req.met ? undefined : '70'}
                >
                  {req.label}
                </Text>
              </Stack>
            ))}
          </Stack>
        </Stack>
      )}
    </Stack>
  );
}
