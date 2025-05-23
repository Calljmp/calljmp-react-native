/**
 * Represents a parsed and validated access token (JWT) for API authentication.
 */
export class AccessToken {
  private constructor(
    private _raw: string,
    private _data: {
      uid: number | null;
      exp: number;
    }
  ) {}

  /**
   * Parses a JWT access token string.
   * @param token JWT token string
   * @returns AccessToken instance
   * @throws Error if the token is invalid
   */
  static parse(token: string) {
    const parts = token.split('.');
    if (parts.length < 2) {
      throw new Error(`Invalid JWT token: ${token}`);
    }
    const base64Payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64Payload));
    return new AccessToken(token, payload);
  }

  /**
   * Tries to parse a JWT access token string, returning error info if invalid.
   * @param token JWT token string
   * @returns Object with data (AccessToken or null) and error (if any)
   */
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

  /**
   * User ID associated with the token, or null if not present.
   */
  get userId() {
    return this._data.uid;
  }

  /**
   * Checks if the token is expired.
   * @returns True if the token is expired, false otherwise
   */
  get isExpired() {
    return this._data.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Checks if the token is valid (not expired).
   * @returns True if the token is valid, false otherwise
   */
  get isValid() {
    return !this.isExpired;
  }

  /**
   * Returns the raw token string.
   * @returns Raw token string
   */
  toString() {
    return this._raw;
  }
}
