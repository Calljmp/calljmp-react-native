import NativeStore from './specs/NativeCalljmpStore';

export type StoreKey = 'accessToken';

export class SecureStore {
  private _cache: Record<StoreKey, string | null | undefined> = {
    accessToken: undefined,
  };

  async put(key: StoreKey, value: string | null) {
    this._cache[key] = value;
    if (value === null) {
      return await NativeStore.secureDelete(key);
    }
    return await NativeStore.securePut(key, value);
  }

  async delete(key: StoreKey) {
    return this.put(key, null);
  }

  async get(key: StoreKey): Promise<string | null> {
    const cachedValue = this._cache[key];
    if (cachedValue === undefined) {
      const value = await NativeStore.secureGet(key);
      this._cache[key] = value;
      return value;
    }
    return cachedValue;
  }
}
