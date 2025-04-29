import { Attestation } from './attestation';
import { Config } from './config';
import { request } from './request';
import { context } from './middleware/context';
import { SecureStore } from './secure-store';
import { AccessToken } from './access';

export class Integrity {
  constructor(
    private _config: Config,
    private _attestation: Attestation,
    private _store: SecureStore
  ) {}

  async challenge() {
    return request(`${this._config.serviceUrl}/integrity/challenge`)
      .use(context(this._config))
      .get()
      .json<{ challengeToken: string }>();
  }

  async authenticated() {
    const token = await this._store.get('accessToken');
    if (token) {
      const { data: accessToken } = AccessToken.tryParse(token);
      if (accessToken) {
        return accessToken.isValid;
      }
    }
    return false;
  }

  async clear() {
    await this._store.delete('accessToken');
  }

  async access({
    challengeToken,
  }: {
    challengeToken?: string;
  } = {}) {
    if (!challengeToken) {
      const result = await this.challenge();
      if (result.error) {
        return result;
      }
      challengeToken = result.data.challengeToken;
    }

    const attest = await this._attestation
      .attest({ token: challengeToken })
      .catch(e => {
        console.warn(
          'Failed to attest, this is a fatal error unless it is in development mode on simulator.',
          e
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));

    const result = await request(`${this._config.serviceUrl}/integrity/access`)
      .use(context(this._config))
      .post({
        token: challengeToken,
        attestationToken,
      })
      .json<{ accessToken: string }>();
    if (result.error) {
      return result;
    }

    await this._store.put('accessToken', result.data.accessToken);

    return {
      data: {},
      error: undefined,
    };
  }
}
