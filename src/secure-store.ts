/**
 * @fileoverview Secure storage implementation for sensitive data like access tokens.
 *
 * Provides encrypted, persistent storage for sensitive data using platform-specific
 * secure storage mechanisms (iOS Keychain, Android Keystore).
 */

import NativeStore from './specs/NativeCalljmpStore';

/**
 * Valid storage keys for the secure store.
 * Currently supports access token storage for authentication.
 */
export type StoreKey = 'accessToken';

/** Prefix for all stored keys to avoid namespace conflicts */
const PREFIX = 'calljmp:store:';

/**
 * Provides secure, persistent key-value storage for sensitive data using platform-specific encryption.
 *
 * The SecureStore class manages sensitive data like access tokens using the device's
 * secure storage mechanisms:
 * - **iOS**: Uses Keychain Services for encrypted storage
 * - **Android**: Uses Android Keystore system for hardware-backed encryption
 *
 * All data is encrypted and persists across app restarts, but is automatically
 * removed when the app is uninstalled. The storage includes an in-memory cache
 * to reduce native bridge calls for frequently accessed data.
 *
 * @example Store and retrieve access token
 * ```typescript
 * const store = new SecureStore();
 *
 * // Store a token
 * await store.put('accessToken', 'jwt-token-here');
 *
 * // Retrieve the token
 * const token = await store.get('accessToken');
 * console.log('Stored token:', token);
 *
 * // Delete the token
 * await store.delete('accessToken');
 * ```
 *
 * @public
 */
export class SecureStore {
  /**
   * In-memory cache for stored values to reduce native bridge calls.
   * Values are cached after first retrieval and updated on put/delete operations.
   *
   * @private
   */
  private _cache: Record<StoreKey, string | null | undefined> = {
    accessToken: undefined,
  };

  /**
   * Stores a value for the given key in secure storage.
   *
   * The value is encrypted and stored using platform-specific secure storage.
   * If the value is null, this behaves the same as calling `delete()`.
   *
   * @param key - The storage key to associate with the value
   * @param value - The value to store, or null to delete the key
   *
   * @returns A promise that resolves when the operation completes
   *
   * @throws {Error} When storage operation fails due to platform restrictions or errors
   *
   * @example Store an access token
   * ```typescript
   * await store.put('accessToken', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
   * console.log('Token stored securely');
   * ```
   *
   * @example Clear a stored value
   * ```typescript
   * await store.put('accessToken', null);
   * console.log('Token cleared from storage');
   * ```
   *
   * @remarks
   * - Values are encrypted using platform-specific secure storage
   * - Storage persists across app restarts but not across app uninstalls
   * - On iOS, uses Keychain Services with appropriate security attributes
   * - On Android, uses Keystore-backed encrypted storage
   */
  async put(key: StoreKey, value: string | null) {
    this._cache[key] = value;
    if (value === null) {
      return await NativeStore.secureDelete(`${PREFIX}${key}`);
    }
    return await NativeStore.securePut(`${PREFIX}${key}`, value);
  }

  /**
   * Deletes a value for the given key from secure storage.
   *
   * This is equivalent to calling `put(key, null)` and completely removes
   * the key-value pair from secure storage.
   *
   * @param key - The storage key to delete
   *
   * @returns A promise that resolves when the deletion completes
   *
   * @example Delete access token
   * ```typescript
   * await store.delete('accessToken');
   * console.log('Access token deleted');
   * ```
   *
   * @remarks
   * - This operation is idempotent (safe to call multiple times)
   * - No error is thrown if the key doesn't exist
   * - The value is also removed from the in-memory cache
   */
  async delete(key: StoreKey) {
    return this.put(key, null);
  }

  /**
   * Retrieves a value for the given key from secure storage.
   *
   * Values are retrieved from the in-memory cache if available, otherwise
   * fetched from secure storage and then cached for future access.
   *
   * @param key - The storage key to retrieve
   *
   * @returns A promise that resolves to the stored value, or null if not found
   *
   * @example Retrieve access token
   * ```typescript
   * const token = await store.get('accessToken');
   * if (token) {
   *   console.log('Found stored token');
   * } else {
   *   console.log('No token found, user needs to authenticate');
   * }
   * ```
   *
   * @example Check if value exists
   * ```typescript
   * const hasToken = (await store.get('accessToken')) !== null;
   * if (hasToken) {
   *   // User is logged in
   * } else {
   *   // User needs to log in
   * }
   * ```
   *
   * @remarks
   * - First access loads from secure storage and caches the result
   * - Subsequent accesses use the cached value for better performance
   * - Returns null if the key doesn't exist or was deleted
   * - Cache is updated automatically on put/delete operations
   */
  async get(key: StoreKey): Promise<string | null> {
    const cachedValue = this._cache[key];
    if (cachedValue === undefined) {
      const value = await NativeStore.secureGet(`${PREFIX}${key}`);
      this._cache[key] = value;
      return value;
    }
    return cachedValue;
  }
}
