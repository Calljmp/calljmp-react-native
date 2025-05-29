/**
 * @fileoverview Device attestation implementation for iOS App Attestation and Android Play Integrity.
 *
 * Provides platform-specific device attestation capabilities to verify the authenticity
 * of the mobile app and device, ensuring requests come from legitimate installations.
 */

import { Platform } from 'react-native';
import NativeDevice from './specs/NativeCalljmpDevice';

/**
 * Provides device attestation APIs for iOS App Attestation and Android Play Integrity verification.
 *
 * The Attestation class handles platform-specific device and app verification to ensure
 * that API requests are coming from legitimate, uncompromised app installations. This is
 * a critical security component that prevents API abuse from modified apps or emulators.
 *
 * On iOS, it uses Apple's App Attestation framework to generate and attest cryptographic keys.
 * On Android, it integrates with Google Play Integrity API to verify app and device integrity.
 *
 * @example iOS attestation setup
 * ```typescript
 * const attestation = new Attestation({
 *   keyId: 'unique-key-identifier'
 * });
 *
 * const result = await attestation.attest({
 *   platform: 'ios',
 *   userId: 123
 * });
 * ```
 *
 * @example Android attestation setup
 * ```typescript
 * const attestation = new Attestation({
 *   android: {
 *     cloudProjectNumber: 123456789
 *   }
 * });
 *
 * const result = await attestation.attest('challenge-data');
 * ```
 *
 * @public
 */
export class Attestation {
  /** iOS attestation key identifier, generated dynamically if not provided */
  private _keyId: string | null;

  /** Android Google Cloud project number for Play Integrity API */
  private _cloudProjectNumber: number | null = null;

  /**
   * Creates a new Attestation instance with platform-specific configuration.
   *
   * @param options - Optional attestation configuration
   * @param options.keyId - iOS attestation key ID (auto-generated if not provided)
   * @param options.android - Android-specific configuration
   * @param options.android.cloudProjectNumber - Google Cloud project number for Play Integrity
   *
   * @example Basic setup
   * ```typescript
   * const attestation = new Attestation();
   * ```
   *
   * @example iOS with custom key ID
   * ```typescript
   * const attestation = new Attestation({
   *   keyId: 'my-custom-key-id'
   * });
   * ```
   *
   * @example Android with Cloud project
   * ```typescript
   * const attestation = new Attestation({
   *   android: {
   *     cloudProjectNumber: 123456789
   *   }
   * });
   * ```
   */
  constructor({
    keyId = null,
    android,
  }: {
    keyId?: string | null;
    android?: {
      cloudProjectNumber?: number;
    };
  } = {}) {
    this._keyId = keyId;

    if (Platform.OS === 'android') {
      this._cloudProjectNumber = android?.cloudProjectNumber ?? null;
    }
  }

  /**
   * Generates a new attestation key ID for iOS App Attestation.
   *
   * This method creates a new cryptographic key pair in the device's Secure Enclave
   * and returns the key identifier. The key is used for subsequent attestation operations.
   * This is automatically called when needed if no key ID was provided during initialization.
   *
   * @returns A promise that resolves to the generated key ID
   *
   * @throws {Error} If called on non-iOS platforms or if key generation fails
   *
   * @internal
   * @remarks
   * - Only available on iOS devices with Secure Enclave support
   * - The generated key is stored securely in the device's hardware
   * - Key generation may fail on jailbroken devices or compromised environments
   */
  private async _generateKeyId() {
    if (Platform.OS === 'ios') {
      if (!this._keyId) {
        this._keyId = await NativeDevice.appleGenerateAttestationKey();
      }
      return this._keyId;
    }

    throw new Error('Key ID generation is only supported on iOS');
  }

  /**
   * Performs platform-specific device attestation and returns verification data.
   *
   * This method executes the appropriate attestation flow based on the current platform:
   * - **iOS**: Uses App Attestation to cryptographically sign the provided data
   * - **Android**: Uses Play Integrity API to generate an integrity token
   *
   * The attestation process verifies that:
   * - The app binary hasn't been tampered with
   * - The device isn't compromised (rooted/jailbroken)
   * - The app is running in a legitimate environment
   *
   * @param data - Data to include in the attestation (string or object that will be JSON-stringified)
   *
   * @returns A promise that resolves to platform-specific attestation result
   *
   * @throws {Error} When attestation fails or platform is unsupported
   *
   * @example Attest with string data
   * ```typescript
   * const result = await attestation.attest('challenge-token-123');
   * console.log('Attestation result:', result);
   * ```
   *
   * @example Attest with object data
   * ```typescript
   * const result = await attestation.attest({
   *   challengeToken: 'abc123',
   *   timestamp: Date.now(),
   *   userId: 456
   * });
   * ```
   *
   * @example Handle attestation results
   * ```typescript
   * try {
   *   const result = await attestation.attest(challengeData);
   *
   *   if (Platform.OS === 'ios') {
   *     console.log('iOS attestation:', result.attestation);
   *     console.log('Bundle ID:', result.bundleId);
   *     console.log('Key ID:', result.keyId);
   *   } else if (Platform.OS === 'android') {
   *     console.log('Android integrity token:', result.integrityToken);
   *     console.log('Package name:', result.packageName);
   *   }
   * } catch (error) {
   *   console.error('Attestation failed:', error);
   * }
   * ```
   *
   * @remarks
   * - **iOS**: Returns an object with `attestation`, `bundleId`, and `keyId` properties
   * - **Android**: Returns an object with `integrityToken` and `packageName` properties
   * - Attestation may fail on compromised devices, emulators, or in debug environments
   * - For development testing, consider handling attestation failures gracefully
   * - The returned data should be sent to your backend for server-side verification
   */
  async attest(data: string | Record<string, unknown>) {
    if (Platform.OS === 'ios') {
      const keyId = await this._generateKeyId();
      return NativeDevice.appleAttestKey(
        keyId,
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    }

    if (Platform.OS === 'android') {
      return NativeDevice.androidRequestIntegrityToken(
        this._cloudProjectNumber,
        typeof data === 'string' ? data : JSON.stringify(data)
      );
    }

    throw new Error(`Unsupported platform: ${Platform.OS}`);
  }
}
