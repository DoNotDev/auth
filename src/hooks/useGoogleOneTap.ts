'use client';
// packages/features/auth/src/hooks/useGoogleOneTap.ts

/**
 * @fileoverview useGoogleOneTap Hook - October 2025 FedCM Mandatory
 *
 * @description
 * Google One Tap with mandatory FedCM compliance. No fallback, no toggles.
 *
 *
 * **Architecture:**
 * ```
 * Component → useGoogleOneTap → useAuth → FirebaseAuth → Firebase SDK
 *                ↓
 *           useFedCM (detection only)
 *           useScriptLoader (Google GSI script)
 * ```
 *
 * @version 0.1.0
 * @since 0.0.1
 * @author AMBROISE PARK Consulting
 */

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  useMemo,
} from 'react';

import { useIsDark } from '@donotdev/components';
import {
  handleError,
  getOAuthClientId,
  getEnabledAuthPartners,
  isClient,
  useTranslation,
  useScriptLoader,
} from '@donotdev/core';

import { useAuth } from '../useAuth';
import { useFedCM } from './useFedCM';

/**
 * Google credential response from One Tap
 */
interface GoogleCredentialResponse {
  /** JWT credential token */
  credential: string;
  /** How the user selected the credential */
  select_by: string;
}

/**
 * Google One Tap configuration (October 2025)
 */
interface GoogleOneTapConfig {
  /** OAuth 2.0 client ID */
  client_id: string;

  /** Callback for successful authentication */
  callback: (response: GoogleCredentialResponse) => void;

  /** Whether to cancel on tap outside */
  cancel_on_tap_outside?: boolean;

  /** Whether to auto-select returning users */
  auto_select?: boolean;

  /** Authentication context */
  context?: 'signin' | 'signup' | 'use';

  /** UX mode */
  ux_mode?: 'popup' | 'redirect';

  /** ITP support for Safari (though Safari doesn't support FedCM yet) */
  itp_support?: boolean;

  /** Optional nonce for security */
  nonce?: string;

  /** Optional parent element ID */
  prompt_parent_id?: string;

  /** Optional state parameter */
  state?: string;

  /** MANDATORY: Always true for October 2025 */
  use_fedcm_for_prompt: true;

  /** Optional allowed parent origins */
  allowed_parent_origins?: string[];

  /** Optional CSP nonce */
  csp_nonce?: string;

  /**
   * Moment callback - THE ONLY place for status handling (October 2025)
   *
   * @description
   * All display, skip, and dismiss status must be handled here.
   * The prompt() callback should only handle credentials.
   */
  moment_callback: (notification: GoogleMomentNotification) => void;
}

/**
 * Google One Tap moment notification (October 2025)
 *
 * @description
 * Replaces all deprecated status methods in prompt() callback.
 * Use these methods exclusively in moment_callback.
 */
interface GoogleMomentNotification {
  /** Get the moment type */
  getMomentType: () => 'display' | 'skipped' | 'dismissed';

  /** Get skip reason (only for skipped moment) */
  getSkippedReason?: () => string;

  /** Get not displayed reason (only for display moment when not displayed) */
  getNotDisplayedReason?: () => string;

  /** Get dismissed reason (only for dismissed moment) */
  getDismissedReason?: () => string;

  /** Check if this is a display moment */
  isDisplayMoment?: () => boolean;

  /** Check if displayed (only for display moment) */
  isDisplayed?: () => boolean;

  /** Check if this is a skipped moment */
  isSkippedMoment?: () => boolean;

  /** Check if this is a dismissed moment */
  isDismissedMoment?: () => boolean;
}

/**
 * Hook options
 */
interface UseGoogleOneTapOptions {
  /** OAuth client ID (optional, reads from config) */
  clientId?: string;

  /** Whether to auto-select returning users */
  autoSelect?: boolean;

  /** Whether to cancel on tap outside */
  cancelOnTapOutside?: boolean;

  /** Optional parent element ID for prompt */
  promptParentId?: string;

  /** Whether hook is disabled */
  disabled?: boolean;

  /** Success callback */
  onSuccess?: (credential: string) => void;

  /** Error callback */
  onError?: (error: Error) => void;

  /** Optional allowed parent origins */
  allowedParentOrigins?: string[];

  /** Optional CSP nonce */
  cspNonce?: string;

  /** Whether to only show on client (after hydration) */
  clientOnly?: boolean;
}

/**
 * Hook return value
 */
interface UseGoogleOneTapReturn {
  /** Whether Google GSI script is loaded */
  isLoaded: boolean;

  /** Whether Google GSI script is loading */
  isLoading: boolean;

  /** Any error during initialization */
  error: Error | null;

  /** Current authenticated user */
  user: any;

  /** Whether dark mode is active */
  isDark: boolean;

  /** Whether browser supports FedCM */
  fedcmSupported: boolean;

  /** Whether component is hydrated (client-side) */
  isHydrated: boolean;

  /** Container ref for Google One Tap prompt */
  containerRef: React.RefObject<HTMLDivElement | null>;

  /** Initialize Google One Tap */
  initialize: () => void;

  /** Handle credential from Google */
  handleCredential: (credential: string) => Promise<void>;

  /** Whether to show the prompt */
  shouldShow: boolean;

  /** Browser information for user messaging */
  browserInfo: {
    name: string;
    isSupported: boolean;
    recommendation: string;
  };

  /** Manually trigger Google Identity Services script loading */
  triggerLoad: () => void;

  /** Whether script load has been triggered */
  loadTriggered: boolean;
}

/**
 * Google One Tap hook with mandatory FedCM
 *
 * @description
 * Hook for Google One Tap authentication with mandatory FedCM compliance.
 * Script loads automatically when the GoogleOneTap component is rendered.
 * If browser doesn't support FedCM, the hook returns an error state.
 *
 * **Usage:**
 * ```tsx
 * const { shouldShow, isLoaded, error, browserInfo } = useGoogleOneTap({
 *   onSuccess: (credential) => console.log('Signed in'),
 *   onError: (error) => console.error('Failed', error)
 * });
 *
 * if (!browserInfo.isSupported) {
 *   return <Alert>{browserInfo.recommendation}</Alert>;
 * }
 * ```
 *
 * **Note:** This hook is only called by the GoogleOneTap component.
 * If the component is not rendered, the script never loads.
 *
 * @param options - Hook configuration
 * @returns Hook state and methods
 */
export function useGoogleOneTap({
  clientId,
  autoSelect = true,
  cancelOnTapOutside = true,
  promptParentId,
  disabled = false,
  onSuccess,
  onError,
  allowedParentOrigins,
  cspNonce,
  clientOnly = false,
}: UseGoogleOneTapOptions = {}): UseGoogleOneTapReturn {
  const { t } = useTranslation('auth');
  // Get user state (reactive) and signInWithGoogleCredential method (stable)
  const user = useAuth('user');
  const signInWithGoogleCredential = useAuth('signInWithGoogleCredential');
  const isDark = useIsDark();

  // Get framework configuration
  const googleClientId = clientId || getOAuthClientId('google');
  const enabledPartners = getEnabledAuthPartners();
  const isGoogleEnabled = enabledPartners.includes('google');

  // Detect FedCM support (mandatory check)
  // Component being rendered means we need the script, so always check
  const {
    isSupported: fedcmSupported,
    isReady: fedcmReady,
    error: fedcmError,
    browserInfo,
  } = useFedCM({
    checkGoogleServices: true,
    onError: (error) => {
      const handledError = handleError(error, {
        userMessage: t(
          'auth.fedcmNotSupported',
          'Your browser does not support Google One Tap'
        ),
        context: { operation: 'fedcm_detection' },
        severity: 'warning',
      });
      onError?.(handledError);
    },
  });

  // Load Google GSI script (only when FedCM is ready and supported)
  // Component being rendered means we need the script, so load automatically
  const {
    isLoading: scriptLoading,
    isLoaded: scriptLoaded,
    error: scriptError,
    isReady: scriptReady,
    load: triggerLoad,
    loadTriggered,
  } = useScriptLoader('https://accounts.google.com/gsi/client', {
    enabled:
      isGoogleEnabled &&
      !!googleClientId &&
      !disabled &&
      fedcmReady &&
      fedcmSupported,
    nonce: cspNonce,
    checkExisting: true,
    isLoaded: () => !!window.google?.accounts?.id,
    onError: (error) => {
      const handledError = handleError(error, {
        userMessage: t(
          'auth.googleScriptLoadError',
          'Failed to load Google Identity Services'
        ),
        context: { operation: 'google_script_load' },
        severity: 'error',
      });
      onError?.(handledError);
    },
  });

  // Component state
  const [isHydrated, setIsHydrated] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Refs for initialization control
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const promptTimeoutRef = useRef<number | null>(null);
  const lastPromptTimeRef = useRef<number>(0);
  const [cooldownActive, setCooldownActive] = useState(false);
  const COOLDOWN_KEY = 'gsi_hide_until';
  const TEN_MINUTES = 10 * 60 * 1000;

  // Determine if we should show (all conditions met)
  const shouldShow = useMemo(
    () =>
      isGoogleEnabled &&
      !!googleClientId &&
      !disabled &&
      !user &&
      fedcmSupported && // CRITICAL: Only show if FedCM supported
      (clientOnly ? isHydrated : true) &&
      !cooldownActive,
    [
      isGoogleEnabled,
      googleClientId,
      disabled,
      user,
      fedcmSupported,
      clientOnly,
      isHydrated,
      cooldownActive,
    ]
  );

  // Combine errors
  const combinedError = useMemo(() => {
    if (!fedcmSupported && fedcmReady) {
      return new Error(
        t(
          'auth.fedcmRequired',
          'Google One Tap requires a modern browser (Chrome 116+ or Edge 116+)'
        )
      );
    }
    return scriptError || fedcmError || error;
  }, [scriptError, fedcmError, error, fedcmSupported, fedcmReady, t]);

  /**
   * Handle credential response from Google
   *
   * @param credential - JWT credential token
   */
  const handleCredential = useCallback(
    async (credential: string) => {
      try {
        if (!credential || typeof credential !== 'string') {
          throw new Error('Invalid credential format');
        }

        await signInWithGoogleCredential(credential);

        startTransition(() => {
          onSuccess?.(credential);
        });
      } catch (err) {
        const error = handleError(err, {
          userMessage: t(
            'auth.googleOneTapError',
            'Google One Tap authentication failed'
          ),
          context: {
            operation: 'google_one_tap_signin',
            credentialLength: credential?.length || 0,
          },
          severity: 'error',
        });

        startTransition(() => {
          setError(error);
        });

        onError?.(error);
        throw error;
      }
    },
    [signInWithGoogleCredential, onSuccess, onError, t]
  );

  /**
   * Initialize Google One Tap with mandatory FedCM
   */
  const initialize = useCallback(() => {
    if (!isClient()) return;
    if (!scriptReady || !googleClientId || !window.google?.accounts?.id) return;
    if (!fedcmSupported) {
      return;
    }
    if (initializedRef.current) return;

    // Rate limiting: 10 minute cooldown per Google's requirement
    const now = Date.now();
    const timeSinceLastPrompt = now - lastPromptTimeRef.current;

    if (timeSinceLastPrompt < TEN_MINUTES && lastPromptTimeRef.current > 0) {
      return;
    }

    try {
      initializedRef.current = true;
      lastPromptTimeRef.current = now;

      const config: GoogleOneTapConfig = {
        client_id: googleClientId,

        // Credential callback - ONLY handles successful credentials
        callback: async (response: GoogleCredentialResponse) => {
          try {
            await handleCredential(response.credential);
          } catch (err) {
            handleError(err, {
              userMessage: 'Google One Tap credential handling failed',
              context: { operation: 'google_one_tap_callback' },
              severity: 'error',
            });
          }
        },

        auto_select: autoSelect,
        cancel_on_tap_outside: cancelOnTapOutside,
        context: 'signin',
        ux_mode: 'popup',
        itp_support: true,
        state: isDark ? 'dark' : 'light',

        // MANDATORY: Always use FedCM (October 2024+)
        use_fedcm_for_prompt: true,

        allowed_parent_origins: allowedParentOrigins,
        csp_nonce: cspNonce,

        /**
         * Moment callback - THE ONLY place for status handling
         *
         * All display, skip, and dismiss events are handled here.
         * This replaces deprecated status methods in prompt() callback.
         */
        moment_callback: (notification: GoogleMomentNotification) => {
          const momentType = notification.getMomentType();

          if (notification.isDisplayMoment?.()) {
            // Display moment
            if (notification.isDisplayed?.()) {
              // Displayed
            } else if (notification.getNotDisplayedReason) {
              initializedRef.current = false; // Allow retry
              try {
                const hideUntil = Date.now() + TEN_MINUTES;
                localStorage.setItem(COOLDOWN_KEY, String(hideUntil));
                setCooldownActive(true);
              } catch {}
            }
          } else if (notification.isSkippedMoment?.()) {
            // Skipped moment
            initializedRef.current = false; // Allow retry
            try {
              const hideUntil = Date.now() + TEN_MINUTES;
              localStorage.setItem(COOLDOWN_KEY, String(hideUntil));
              setCooldownActive(true);
            } catch {}
          } else if (notification.isDismissedMoment?.()) {
            // Dismissed moment
            initializedRef.current = false; // Allow retry
            try {
              const hideUntil = Date.now() + TEN_MINUTES;
              localStorage.setItem(COOLDOWN_KEY, String(hideUntil));
              setCooldownActive(true);
            } catch {}
          }
        },
      };

      if (promptParentId) {
        config.prompt_parent_id = promptParentId;
      }

      // Initialize Google One Tap
      window.google.accounts.id.initialize(config);

      // Debounced prompt call
      if (promptTimeoutRef.current) {
        window.clearTimeout(promptTimeoutRef.current);
      }

      promptTimeoutRef.current = window.setTimeout(() => {
        // prompt() callback receives credential response
        window.google?.accounts?.id?.prompt(
          (response: GoogleCredentialResponse) => {
            // October 2025: Only handle credential here, nothing else
            if (response?.credential) {
              handleCredential(response.credential);
            }
            // All status handling happens in moment_callback above
          }
        );
        promptTimeoutRef.current = null;
      }, 100);
    } catch (err) {
      const error = handleError(err, {
        userMessage: t(
          'auth.googleOneTapInitError',
          'Failed to initialize Google One Tap'
        ),
        context: {
          operation: 'google_one_tap_initialize',
          fedcmSupported,
        },
        severity: 'error',
      });

      startTransition(() => {
        setError(error);
      });

      onError?.(error);
      initializedRef.current = false;
    }
  }, [
    scriptReady,
    googleClientId,
    fedcmSupported,
    autoSelect,
    cancelOnTapOutside,
    promptParentId,
    isDark,
    handleCredential,
    onError,
    allowedParentOrigins,
    cspNonce,
    t,
  ]);

  // Hydration detection
  useEffect(() => {
    if (typeof window !== 'undefined') {
      startTransition(() => {
        setIsHydrated(true);
      });
      try {
        const until = Number(localStorage.getItem(COOLDOWN_KEY) || 0);
        setCooldownActive(until > Date.now());
      } catch {}
    }
  }, []);

  // Initialize when ready
  useEffect(() => {
    if (scriptLoaded && !disabled && shouldShow && fedcmReady) {
      initialize();
    }
  }, [scriptLoaded, disabled, shouldShow, fedcmReady, initialize]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (promptTimeoutRef.current) {
        window.clearTimeout(promptTimeoutRef.current);
      }
      initializedRef.current = false;
    };
  }, []);

  return {
    isLoaded: scriptLoaded,
    isLoading: scriptLoading,
    error: combinedError,
    user,
    isDark,
    fedcmSupported,
    isHydrated,
    containerRef,
    initialize,
    handleCredential,
    shouldShow,
    browserInfo,
    triggerLoad,
    loadTriggered,
  };
}
