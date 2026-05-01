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
  /** Current password value */
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
  t: (key: string, defaultValue?: string) => string
): PasswordRequirement[] {
  return [
    {
      label: t(
        'passwordRequirement.length',
        `At least ${minLength} characters`
      ),
      met: password.length >= minLength,
    },
    {
      label: t('passwordRequirement.uppercase', 'One uppercase letter'),
      met: /[A-Z]/.test(password),
    },
    {
      label: t('passwordRequirement.lowercase', 'One lowercase letter'),
      met: /[a-z]/.test(password),
    },
    {
      label: t('passwordRequirement.number', 'One number'),
      met: /[0-9]/.test(password),
    },
    {
      label: t(
        'passwordRequirement.special',
        'One special character (!@#$%^&*)'
      ),
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
 * Uses Progress component for the strength bar and Text for labels.
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
    const translate = (key: string, defaultValue?: string) => {
      return t(key, defaultValue || '');
    };
    return getPasswordRequirements(password, minLength, translate);
  }, [password, minLength, t]);

  const strengthLabels: Record<PasswordStrength, string> = {
    weak: t('passwordStrength.weak', 'Weak'),
    fair: t('passwordStrength.fair', 'Fair'),
    good: t('passwordStrength.good', 'Good'),
    strong: t('passwordStrength.strong', 'Strong'),
  };

  return (
    <Stack gap="tight" className={cn('dndev-password-strength', className)}>
      {/* Strength bar */}
      <Stack gap="tight">
        <Stack direction="row" align="center" justify="between" gap="tight">
          <Text as="span" level="caption" variant="muted">
            {t('passwordStrength.label', 'Password strength')}:
          </Text>
          <Text
            as="strong"
            level="caption"
            variant={strengthToVariant[strength]}
          >
            {strengthLabels[strength]}
          </Text>
        </Stack>
        <Progress
          value={strengthToPercent[strength]}
          variant={strengthToVariant[strength]}
          className="dndev-password-strength-bar"
        />
      </Stack>

      {/* Requirements checklist */}
      {showRequirements && (
        <Stack gap="tight" className="dndev-password-requirements">
          <Text as="strong" level="caption" variant="muted">
            {t('passwordRequirements', 'Password requirements')}:
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
