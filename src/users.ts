import { jsonToUser, UserAuthenticationPolicy } from './common';
import { Attestation } from './attestation';
import { Config } from './config';
import { context } from './middleware/context';
import { request } from './request';
import { Store } from './store';
import { access } from './middleware/access';

export class Users {
  constructor(
    private _config: Config,
    private _attestation: Attestation,
    private _store: Store
  ) {}

  async retrieve() {
    const result = await request(`${this._config.serviceUrl}/users`)
      .use(context(this._config), access(this._store))
      .get()
      .json();
    return {
      data: result.data && jsonToUser(result.data),
      error: result.error,
    };
  }

  async authChallenge() {
    return request(`${this._config.serviceUrl}/users/auth/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

  async clearAuth() {
    await this._store.secureDelete('accessToken');
  }

  async authWithEmail({
    challengeToken,
    ...args
  }: {
    challengeToken?: string;
    email: string;
    password?: string;
    tags?: string[];
    policy?: UserAuthenticationPolicy;
  }) {
    if (!args.password) {
      throw new Error('Password is required');
    }

    if (!challengeToken) {
      const result = await this.authChallenge();
      if (result.error) {
        return result;
      }
      challengeToken = result.data.challengeToken;
    }

    const attest = await this._attestation
      .attest({ token: challengeToken })
      .catch((e) => {
        console.warn(
          'Failed to attest, this is a fatal error unless it is in development mode on simulator.',
          e
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));

    const result = await request(`${this._config.serviceUrl}/users/auth/email`)
      .use(context(this._config))
      .post({
        ...args,
        token: challengeToken,
        attestationToken,
      })
      .json<{ accessToken: string; user: Record<string, unknown> }>();
    if (result.error) {
      return result;
    }

    await this._store.securePut('accessToken', result.data.accessToken);

    return {
      data: {
        user: jsonToUser(result.data.user),
      },
      error: undefined,
    };
  }
}
