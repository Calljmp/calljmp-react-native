import { Platform } from 'react-native';
import { Attestation } from './attestation';
import { Config } from './config';
import { request } from './request';
import { context } from './middleware/context';

/**
 * Provides project-related operations, such as connecting the app to the backend project.
 */
export class Project {
  /**
   * @param _config SDK configuration
   * @param _attestation Device attestation provider
   */
  constructor(
    private _config: Config,
    private _attestation: Attestation
  ) {}

  /**
   * Connects the app to the backend project, performing device attestation.
   * @returns Project connection result from the backend
   */
  async connect() {
    const attest = await this._attestation
      .attest({ platform: Platform.OS })
      .catch(e => {
        console.warn(
          'Failed to attest, this is a fatal error unless it is in development mode on simulator.',
          e
        );
        return null;
      });
    const attestationToken = btoa(JSON.stringify(attest));
    return await request(`${this._config.projectUrl}/app/connect`)
      .use(context(this._config))
      .post({ attestationToken })
      .json();
  }
}
