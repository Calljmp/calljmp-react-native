import NativeStore from './specs/NativeCalljmpStore';

export type StoreKey = 'accessToken';

export class Store {
  private _cache: Record<StoreKey, string | null | undefined> = {
    accessToken: undefined,
  };

  async securePut(key: StoreKey, value: string | null) {
    this._cache[key] = value;
    if (value === null) {
      return await NativeStore.secureDelete(key);
    }
    return await NativeStore.securePut(key, value);
  }

  async secureDelete(key: StoreKey) {
    return this.securePut(key, null);
  }

  async secureGet(key: StoreKey): Promise<string | null> {
    const cachedValue = this._cache[key];
    if (cachedValue === undefined) {
      const value = await NativeStore.secureGet(key);
      this._cache[key] = value;
      return value;
    }
    return cachedValue;
  }
}
