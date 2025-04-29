export class AccessToken {
  private constructor(
    private _raw: string,
    private _data: {
      userId: number | null;
      projectId: number;
      databaseId: string;
      serviceUuid: string | null;
      exp: number; // Expiration time in seconds since epoch
    }
  ) {}

  static parse(token: string) {
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid JWT token: ${token}`);
    }
    const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64Payload));
    return new AccessToken(token, payload);
  }

  static tryParse(token: string): {
    data: AccessToken | null;
    error: Error | null;
  } {
    try {
      const accessToken = AccessToken.parse(token);
      return {
        data: accessToken,
        error: null,
      };
    } catch (error) {
      return {
        data: null,
        error: new Error('Failed to decode access token', { cause: error }),
      };
    }
  }

  get userId() {
    return this._data.userId;
  }

  get projectId() {
    return this._data.projectId;
  }

  get databaseId() {
    return this._data.databaseId;
  }

  get serviceUuid() {
    return this._data.serviceUuid;
  }

  get isExpired() {
    return this._data.exp < Math.floor(Date.now() / 1000);
  }

  get isValid() {
    return !this.isExpired;
  }

  toString() {
    return this._raw;
  }
}
