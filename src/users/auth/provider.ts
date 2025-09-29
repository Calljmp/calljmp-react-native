import { Auth } from '.';
import { AccessToken } from '../../access';
import { Attestation } from '../../attestation';
import {
  jsonToUser,
  UserAuthenticationPolicy,
  UserAuthenticationProvider,
} from '../../common';
import { Config } from '../../config';
import { sha256 } from '../../crypto';
import { accessSupport } from '../../middleware/access';
import { context } from '../../middleware/context';
import { request } from '../../request';
import { AccessResolver } from '../../utils/access-resolver';

/**
 * Provides OAuth2-based authentication methods for third-party provider integration.
 *
 * The Provider class handles the complete OAuth2 authentication flow including:
 * - Integration with external providers (Apple, Google, Facebook, etc.)
 * - Identity token validation and user creation/login
 * - Device attestation for enhanced security
 * - Automatic challenge token generation and management
 * - Secure access token storage
 *
 * This class supports both new user registration and existing user login
 * through various OAuth2 providers, with built-in device attestation
 * for additional security verification.
 *
 * @public
 */
export class Provider {
  /**
   * Creates a new OAuth2 Provider authentication instance.
   *
   * @param _provider - The OAuth2 provider type (Apple, Google, Facebook, etc.)
   * @param _config - SDK configuration containing service URLs and settings
   * @param _attestation - Device attestation provider for security verification
   * @param _access - Access resolver for managing access tokens and permissions
   * @param _auth - Parent Auth instance for challenge token generation
   *
   * @internal
   */
  constructor(
    private _provider: UserAuthenticationProvider,
    private _config: Config,
    private _attestation: Attestation,
    private _access: AccessResolver,
    private _auth: Auth
  ) {}

  /**
   * Authenticates a user using OAuth2 identity token with device attestation.
   *
   * Performs complete OAuth2 authentication by validating the identity token
   * from the specified provider and creating or logging in the user. This method
   * integrates device attestation for enhanced security and automatically manages
   * challenge tokens if not provided.
   *
   * The authentication process includes:
   * 1. Challenge token generation (if not provided)
   * 2. Device attestation using identity token and challenge token
   * 3. Server-side identity token validation
   * 4. User creation or login
   * 5. Secure access token storage
   *
   * @param args - Authentication parameters
   * @param args.identityToken - OAuth2 identity token from the provider
   * @param args.challengeToken - Optional challenge token (auto-generated if not provided)
   * @param args.emailVerified - Whether the email from provider is verified
   * @param args.name - User's display name (recommended for new users)
   * @param args.tags - Optional user tags for categorization and analytics
   * @param args.policy - Authentication policy settings for additional security
   * @param args.doNotNotify - If true, suppresses welcome/notification emails
   * @returns Promise resolving to authenticated user data or error
   *
   * @throws Error if identityToken is not provided
   * @throws Error if device attestation fails in production mode
   *
   * @public
   */
  async authenticate({
    challengeToken,
    ...args
  }: {
    identityToken: string;
    challengeToken?: string;
    emailVerified?: boolean;
    name?: string;
    tags?: string[];
    policy?: UserAuthenticationPolicy;
    doNotNotify?: boolean;
  }) {
    if (!challengeToken) {
      const result = await this._auth.challenge();
      if (result.error) {
        return result;
      }
      challengeToken = result.data.challengeToken;
    }

    const attestationHash = await sha256(
      `${args.identityToken}:${challengeToken}`
    );
    const attest = await this._attestation
      .attest({ hash: attestationHash })
      .catch(() => {
        console.info(
          '[Integrity] Attestation failed - this may happen on simulators or debug environments'
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));

    const result = await request(
      `${this._config.serviceUrl}/users/auth/provider/${this._provider}`
    )
      .use(context(this._config), accessSupport(this._config))
      .post({
        ...args,
        challengeToken,
        attestationToken,
        devApiToken:
          this._config.development?.enabled &&
          this._config.development?.apiToken,
      })
      .json(json => ({
        accessToken: json.accessToken as string,
        user: jsonToUser(json.user),
      }));
    if (result.error) {
      return result;
    }

    const { data: accessToken, error } = AccessToken.tryParse(
      result.data.accessToken
    );
    if (error || !accessToken) {
      return {
        data: undefined,
        error: new Error('Received invalid access token from server'),
      };
    }

    await this._access.put(accessToken);

    return {
      data: {
        user: result.data.user,
      },
      error: undefined,
    };
  }
}
