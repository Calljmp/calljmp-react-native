export class LruCache<K = string, T = any> {
  private _maxSize: number;
  private _cache: Map<K, { value: T; size: number }>;
  private _currentSize: number;

  constructor(maxSize: number) {
    this._maxSize = maxSize;
    this._cache = new Map();
    this._currentSize = 0;
  }

  get(key: K): T | undefined {
    const entry = this._cache.get(key);
    if (!entry) {
      return undefined;
    }

    this._cache.delete(key);
    this._cache.set(key, entry);
    return entry.value as T;
  }

  set(key: K, value: T, size = 1) {
    if (size > this._maxSize) {
      throw new Error('Item size exceeds maximum cache size');
    }

    if (this._cache.has(key)) {
      const existingEntry = this._cache.get(key)!;
      this._currentSize -= existingEntry.size;
      this._cache.delete(key);
    } else {
      while (this._currentSize + size > this._maxSize) {
        const oldestKey = this._cache.keys().next().value!;
        const oldestEntry = this._cache.get(oldestKey);
        if (oldestEntry) {
          this._currentSize -= oldestEntry.size;
          this._cache.delete(oldestKey);
        }
      }
    }

    this._cache.set(key, { value, size });
    this._currentSize += size;
  }

  has(key: K) {
    return this._cache.has(key);
  }

  delete(key: K) {
    const entry = this._cache.get(key);
    if (entry) {
      this._currentSize -= entry.size;
      this._cache.delete(key);
    }
  }

  clear() {
    this._cache.clear();
    this._currentSize = 0;
  }

  get size() {
    return this._currentSize;
  }

  get itemCount() {
    return this._cache.size;
  }
}
