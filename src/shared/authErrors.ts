export interface AuthGuidance {
  title: string
  summary: string
  steps: string[]
  technical: string
  helpUrl?: string
  helpLabel?: string
}

const AZURE_APPS =
  'https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade'

function cleanDetail(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value ?? '')
  const withoutRpc = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, '')
    .replace(/^Error:\s*/i, '')
  const redacted = withoutRpc
    .replace(
      /(["']?(?:access_token|refresh_token|client_secret|authorization)["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;}]+)/gi,
      '$1[redacted]'
    )
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .trim()
  return redacted.slice(0, 1600) || 'No additional diagnostic details were returned.'
}

function guidance(
  title: string,
  summary: string,
  steps: string[],
  technical: string,
  help?: { url: string; label: string }
): AuthGuidance {
  return {
    title,
    summary,
    steps,
    technical,
    ...(help ? { helpUrl: help.url, helpLabel: help.label } : {})
  }
}

/**
 * Converts raw Microsoft/Xbox/network failures into a short explanation and
 * concrete recovery steps. The technical detail is kept separately so the UI
 * can hide it behind a disclosure.
 */
export function explainAuthError(input: unknown): AuthGuidance {
  const technical = cleanDetail(input)
  const source = technical.toLowerCase()

  if (source.includes('2148916238')) {
    return guidance(
      'A family account needs approval',
      'Microsoft says this account is managed by a family group and cannot sign in to Xbox Live by itself yet.',
      [
        'Ask the family organiser to approve this account for Xbox Live and Minecraft.',
        'Sign in with the adult Microsoft account once, then retry with this account.',
        'If the account is for a child, check the family settings at account.microsoft.com/family.'
      ],
      technical,
      { url: 'https://account.microsoft.com/family', label: 'Open family settings' }
    )
  }

  if (source.includes('2148916233')) {
    return guidance(
      'This Microsoft account has no Xbox profile',
      'Minecraft uses your Xbox profile, and this account has not created one yet.',
      [
        'Open xbox.com and create an Xbox profile for this Microsoft account.',
        'Return to Triad and choose Continue with Microsoft again.',
        'Use the same account that owns Minecraft: Java Edition.'
      ],
      technical,
      { url: 'https://www.xbox.com', label: 'Create Xbox profile' }
    )
  }

  if (source.includes('2148916235')) {
    return guidance(
      'Xbox Live is unavailable in this region',
      'Microsoft rejected this account because Xbox Live is not offered in its region.',
      [
        'Use a Microsoft account from a supported Xbox Live region.',
        'If you recently moved, check your account region at account.microsoft.com.',
        'Contact Xbox support if the region shown on your account is wrong.'
      ],
      technical,
      { url: 'https://www.xbox.com', label: 'Open Xbox support' }
    )
  }

  if (source.includes('2148916236') || source.includes('2148916237')) {
    return guidance(
      'Xbox needs adult verification',
      'Microsoft requires an adult to verify this account before it can use Xbox Live.',
      [
        'Sign in at xbox.com with an adult Microsoft account and complete the verification.',
        'Then return to Triad and retry the sign-in.',
        'If the prompt does not appear, check the account’s birth date and family settings.'
      ],
      technical,
      { url: 'https://www.xbox.com', label: 'Open Xbox account' }
    )
  }

  if (source.includes('214891623')) {
    return guidance(
      'Xbox could not sign in with this account',
      'Microsoft rejected the Xbox Live step for this Microsoft account.',
      [
        'Sign in at xbox.com to check whether the account can access Xbox Live.',
        'If you see a prompt there, complete it and retry in Triad.',
        'If it still fails, contact Xbox support and include the technical details below.'
      ],
      technical,
      { url: 'https://www.xbox.com', label: 'Check Xbox account' }
    )
  }

  if (
    source.includes('does not own minecraft') ||
    source.includes('minecraft: java edition') ||
    source.includes('profile not found')
  ) {
    return guidance(
      'This account does not own Minecraft: Java Edition',
      'The Microsoft account signed in successfully, but it has no Java Edition profile.',
      [
        'Sign in with the Microsoft account that purchased Minecraft: Java Edition.',
        'If you own the game on another account, sign out and use that account instead.',
        'If you just purchased it, wait a few minutes for the entitlement to appear, then retry.'
      ],
      technical,
      { url: 'https://www.minecraft.net/en-us/login', label: 'Check Minecraft account' }
    )
  }

  if (
    source.includes('expired_token') ||
    source.includes('bad_verification_code') ||
    source.includes('code expired') ||
    source.includes('sign-in code expired') ||
    source.includes('session expired') ||
    source.includes('invalid_grant')
  ) {
    return guidance(
      'The Microsoft sign-in expired',
      'The device code or saved session is no longer valid. This is normal if the sign-in page stayed open too long.',
      [
        'Choose Continue with Microsoft to get a fresh code.',
        'Enter the new code at microsoft.com/link within about 15 minutes.',
        'If you were already signed in, sign out and sign in again.'
      ],
      technical
    )
  }

  if (
    source.includes('authorization_declined') ||
    source.includes('declined') ||
    source.includes('consent_required')
  ) {
    return guidance(
      'The Microsoft sign-in was not approved',
      'The browser sign-in was cancelled or permission was declined.',
      [
        'Start the sign-in again and approve Triad when Microsoft asks.',
        'If you are using a work or school account, your organisation may block this app.',
        'Try a personal Microsoft account if your organisation requires administrator approval.'
      ],
      technical
    )
  }

  if (source.includes('aadsts50020') || source.includes('aadsts50059')) {
    return guidance(
      'This Microsoft account type is not supported',
      'The account belongs to an organisation, or is missing a tenant, so the personal sign-in endpoint cannot use it.',
      [
        'Try a personal Microsoft account that owns Minecraft: Java Edition.',
        'If this is a work or school account, ask your administrator to allow Minecraft sign-in.',
        'If you use a custom Azure app, make sure it accepts personal Microsoft accounts.'
      ],
      technical
    )
  }

  if (
    source.includes('aadsts700016') ||
    source.includes('invalid_client') ||
    source.includes('unauthorized_client') ||
    source.includes('application with identifier') ||
    source.includes('client id') ||
    source.includes('client_id')
  ) {
    return guidance(
      'Microsoft rejected the launcher’s app ID',
      'The configured Microsoft client ID is not valid for this sign-in method.',
      [
        'Open Settings → Advanced and choose Use default next to Microsoft client ID.',
        'If you use your own Azure app, make sure it supports personal Microsoft accounts.',
        'Enable public client/device-code flow for that app registration, then restart Triad.'
      ],
      technical,
      { url: AZURE_APPS, label: 'Open Azure app registrations' }
    )
  }

  if (source.includes('aadsts65001') || source.includes('consent')) {
    return guidance(
      'Microsoft needs permission approval',
      'The account has not granted Triad the permissions needed to sign in to Xbox Live and Minecraft.',
      [
        'Retry the sign-in and accept the permission prompt in the browser.',
        'If you use a work or school account, ask your administrator to approve the app.',
        'Try a personal Microsoft account if admin approval is unavailable.'
      ],
      technical
    )
  }

  if (source.includes('429') || source.includes('rate limit') || source.includes('too many requests')) {
    return guidance(
      'Microsoft is rate-limiting sign-ins',
      'Too many sign-in attempts reached Microsoft from this connection.',
      [
        'Wait a few minutes before trying again.',
        'Close extra Triad windows or sign-in tabs that may still be polling.',
        'If you use a VPN or shared network, try again on a different connection.'
      ],
      technical
    )
  }

  if (
    source.includes('fetch failed') ||
    source.includes('network') ||
    source.includes('enotfound') ||
    source.includes('econnrefused') ||
    source.includes('econnreset') ||
    source.includes('etimedout') ||
    source.includes('eai_again') ||
    source.includes('enotreach') ||
    source.includes('socket') ||
    source.includes('offline') ||
    source.includes('internet') ||
    source.includes('proxy')
  ) {
    return guidance(
      'Triad could not reach Microsoft',
      'The sign-in request could not connect to Microsoft’s servers.',
      [
        'Check your internet connection and try again.',
        'If you use a VPN, proxy or firewall, allow login.live.com, login.microsoftonline.com, xboxlive.com and minecraftservices.com.',
        'Temporarily disable a proxy or VPN to see whether it is blocking the request.'
      ],
      technical
    )
  }

  if (source.includes('cancelled') || source.includes('aborted')) {
    return guidance(
      'Sign-in was cancelled',
      'The sign-in attempt was stopped before Microsoft returned an account.',
      ['Choose Continue with Microsoft to start again.'],
      technical
    )
  }

  return guidance(
    'Microsoft sign-in did not complete',
    'Triad received an unexpected response while signing in.',
    [
      'Try the sign-in once more; temporary Microsoft errors are common.',
      'If it keeps failing, open the technical details below and check the exact error code.',
      'For app-ID or permission errors, clear the custom client ID in Settings → Advanced and retry.'
    ],
    technical
  )
}
