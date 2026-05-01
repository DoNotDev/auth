# Authentication Configuration in DoNotDev

## Overview

DoNotDev uses environment variables for configuration to provide a clean, centralized approach to managing authentication providers. This guide explains how to configure authentication providers in your application.

## Configuration Using Environment Variables

### Setting Up Auth Providers

The `VITE_AUTH_PARTNERS` environment variable controls which authentication providers are enabled in your application. This is a comma-separated list of provider names.

**Example:**

```
VITE_AUTH_PARTNERS=google,github,facebook
```

### Available Providers

The following providers are supported:

- `google` - Google authentication
- `facebook` - Facebook authentication
- `github` - GitHub authentication
- `twitter` - Twitter authentication
- `microsoft` - Microsoft authentication
- `yahoo` - Yahoo authentication
- `apple` - Apple authentication

### Environment-Specific Configuration

You can create different configurations for different environments:

- `.env` - Default configuration
- `.env.development` - Development-specific configuration
- `.env.production` - Production-specific configuration

Example `.env.development`:

```
VITE_AUTH_PARTNERS=google
```

Example `.env.production`:

```
VITE_AUTH_PARTNERS=google,github,facebook,twitter
```

## How It Works

1. The environment variable is read by the `getEnabledAuthProviders()` function in `@donotdev/auth`
2. This configuration is used throughout the entire application automatically
3. No prop passing or manual configuration is needed in your components

## Default Configuration

If the `VITE_AUTH_PARTNERS` environment variable is not set, the system defaults to enabling only Google authentication.

## Best Practices

1. Use environment variables for configuration across environments
2. Include `.env.example` in your repository to document available options
3. Add `.env`, `.env.development`, and `.env.production` to your `.gitignore` file
4. Set up different provider configurations for different environments (e.g., fewer providers in development)

## Example Configuration Files

### `.env.example`

```
# Authentication Configuration
# Comma-separated list of enabled auth providers
# Available options: google,facebook,github,twitter,microsoft,yahoo,apple
VITE_AUTH_PARTNERS=google,github,facebook
```

### `.env.development`

```
# Use only Google auth in development for simplicity
VITE_AUTH_PARTNERS=google
```

### `.env.production`

```
# Enable multiple providers in production
VITE_AUTH_PARTNERS=google,github,facebook,twitter
```

## Firebase Configuration

Remember that you'll need to enable the corresponding authentication providers in your Firebase project for them to work:

1. Go to the Firebase Console
2. Navigate to Authentication > Sign-in method
3. Enable each provider you've specified in your environment variables
4. Configure the necessary OAuth credentials for each provider

Every step is detailled in /packages/core/auth/src/config/authProviderConfig.ts

## 📄 License & Ownership

All rights reserved.  
The DoNotDev framework and its premium features are the exclusive property of **Ambroise Park Consulting**.

- Licensed under MIT. See LICENSE.md.

© Ambroise Park Consulting – 2025
