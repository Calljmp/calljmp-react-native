/**
 * @fileoverview Project management API for connecting mobile apps to Calljmp backend projects.
 *
 * Handles the initial connection between the mobile app and the backend project,
 * including device attestation and project authentication.
 */

import { Platform } from 'react-native';
import { Attestation } from './attestation';
import { Config } from './config';
import { request } from './request';
import { context } from './middleware/context';

/**
 * Provides project-related operations for connecting mobile apps to backend projects.
 *
 * The Project class handles the initial handshake between your mobile app and the
 * Calljmp backend, performing device attestation to establish a secure connection.
 * This is typically the first API call you'll make after initializing the SDK.
 *
 * @example Connect to a project
 * ```typescript
 * const sdk = new Calljmp();
 * const result = await sdk.project.connect();
 * console.log('Connected to project:', result);
 * ```
 *
 * @public
 */
export class Project {
  /**
   * Creates a new Project instance.
   *
   * @param _config - SDK configuration containing API endpoints and settings
   * @param _attestation - Device attestation provider for iOS/Android platform verification
   *
   * @internal
   */
  constructor(
    private _config: Config,
    private _attestation: Attestation
  ) {}

  /**
   * Connects the mobile app to the backend project by performing device attestation.
   *
   * This method performs platform-specific device attestation (iOS App Attestation or
   * Android Play Integrity) to verify the authenticity of the device and app, then
   * establishes a connection to the backend project.
   *
   * The attestation process helps ensure that requests are coming from legitimate
   * app installations and not from compromised or emulated environments.
   *
   * @returns A promise that resolves to the project connection result from the backend
   *
   * @throws {Error} When attestation fails on production devices or network errors occur
   *
   * @example Basic project connection
   * ```typescript
   * try {
   *   const result = await sdk.project.connect();
   *   console.log('Successfully connected to project');
   * } catch (error) {
   *   console.error('Failed to connect:', error);
   * }
   * ```
   *
   * @remarks
   * - On iOS, this uses App Attestation to verify the app's authenticity
   * - On Android, this uses Play Integrity to verify the app and device
   * - In development mode on simulators/emulators, attestation failures are logged as warnings
   * - This should be called early in your app's lifecycle, typically after SDK initialization
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
