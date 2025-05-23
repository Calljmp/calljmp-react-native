import NativeStore from './specs/NativeCalljmpStore';

export type StoreKey = 'accessToken';

const PREFIX = 'calljmp:store:';

/**
 * Provides secure, persistent key-value storage for sensitive data (e.g., tokens).
 */
export class SecureStore {
  private _cache: Record<StoreKey, string | null | undefined> = {
    accessToken: undefined,
  };

  /**
   * Stores a value for a given key in secure storage.
   * @param key Storage key
   * @param value Value to store (or null to delete)
   */
  async put(key: StoreKey, value: string | null) {
    this._cache[key] = value;
    if (value === null) {
      return await NativeStore.secureDelete(`${PREFIX}${key}`);
    }
    return await NativeStore.securePut(`${PREFIX}${key}`, value);
  }

  /**
   * Deletes a value for a given key from secure storage.
   * @param key Storage key
   */
  async delete(key: StoreKey) {
    return this.put(key, null);
  }

  /**
   * Retrieves a value for a given key from secure storage.
   * @param key Storage key
   * @returns The stored value or null if not found
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
