/**
 * @fileoverview Access token parsing and validation utilities for JWT tokens.
 *
 * This module provides the `AccessToken` class for parsing, validating, and working with
 * JWT access tokens used for API authentication in the Calljmp SDK. It handles token
 * decoding, expiration checking, and user ID extraction.
 *
 * @example Basic token usage
 * ```typescript
 * // Parse a JWT token
 * const token = AccessToken.parse('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...');
 *
 * // Check if token is valid
 * if (token.isValid) {
 *   console.log('User ID:', token.userId);
 * }
 *
 * // Safe parsing
 * const { data: token, error } = AccessToken.tryParse(tokenString);
 * if (error) {
 *   console.error('Invalid token:', error.message);
 * }
 * ```
 *
 * @example Token validation
 * ```typescript
 * // Check expiration status
 * if (token.isExpired) {
 *   // Refresh or re-authenticate
 *   await refreshToken();
 * }
 *
 * // Get raw token for API calls
 * const authHeader = `Bearer ${token.toString()}`;
 * ```
 *
 * @public
 */

/**
 * Represents a parsed and validated access token (JWT) for API authentication.
 *
 * The AccessToken class provides methods to parse JWT tokens, validate their
 * expiration status, and extract user information. It's used throughout the
 * SDK for authenticated API requests.
 *
 * @example
 * ```typescript
 * // Parse a token and check validity
 * const token = AccessToken.parse(jwtString);
 *
 * if (token.isValid) {
 *   console.log('Token is valid for user:', token.userId);
 * } else {
 *   console.log('Token has expired');
 * }
 * ```
 *
 * @public
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
   * Parses a JWT access token string into an AccessToken instance.
   *
   * This method decodes the JWT payload and creates an AccessToken object
   * that can be used for validation and user identification.
   *
   * @param token - The JWT token string to parse
   * @returns AccessToken instance with parsed token data
   * @throws Error if the token format is invalid or cannot be decoded
   *
   * @example
   * ```typescript
   * try {
   *   const token = AccessToken.parse('eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...');
   *   console.log('User ID:', token.userId);
   * } catch (error) {
   *   console.error('Invalid token:', error.message);
   * }
   * ```
   *
   * @public
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
   * Safely attempts to parse a JWT access token string without throwing errors.
   *
   * This method provides a safe way to parse tokens that might be invalid,
   * returning both the result and any error that occurred during parsing.
   *
   * @param token - The JWT token string to parse
   * @returns Object containing either the parsed AccessToken or an error
   * @returns data - The parsed AccessToken instance, or null if parsing failed
   * @returns error - Error object if parsing failed, or null if successful
   *
   * @example
   * ```typescript
   * const { data: token, error } = AccessToken.tryParse(tokenString);
   *
   * if (error) {
   *   console.error('Failed to parse token:', error.message);
   *   // Handle invalid token case
   * } else {
   *   console.log('Token parsed successfully:', token?.userId);
   * }
   * ```
   *
   * @public
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
   * Gets the user ID associated with this access token.
   *
   * The user ID is extracted from the JWT payload and represents the
   * authenticated user. Returns null if no user ID is present in the token.
   *
   * @returns The user ID number, or null if not present
   *
   * @example
   * ```typescript
   * const token = AccessToken.parse(jwtString);
   *
   * if (token.userId) {
   *   console.log('Authenticated user ID:', token.userId);
   * } else {
   *   console.log('Anonymous or service token');
   * }
   * ```
   *
   * @public
   */
  get userId() {
    return this._data.uid;
  }

  /**
   * Checks if the access token has expired based on its expiration timestamp.
   *
   * Compares the token's expiration time (exp claim) with the current time
   * to determine if the token is no longer valid.
   *
   * @returns True if the token has expired, false if still valid
   *
   * @example
   * ```typescript
   * const token = AccessToken.parse(jwtString);
   *
   * if (token.isExpired) {
   *   console.log('Token has expired, need to refresh');
   *   // Implement token refresh logic
   * }
   * ```
   *
   * @public
   */
  get isExpired() {
    return this._data.exp < Math.floor(Date.now() / 1000);
  }

  /**
   * Checks if the access token is nearing expiration (within 5 minutes).
   *
   * This is a convenience method to determine if the token should be refreshed
   * soon, even if it hasn't fully expired yet.
   *
   * @returns True if the token is expiring soon, false otherwise
   *
   * @example
   * ```typescript
   * const token = AccessToken.parse(jwtString);
   *
   * if (token.isExpiring) {
   *   console.log('Token is expiring soon, consider refreshing');
   * }
   * ```
   *
   * @public
   */
  get isExpiring() {
    const now = Math.floor(Date.now() / 1000);
    // Consider token expiring if less than 5 minutes left
    return this._data.exp < now + 5 * 60;
  }

  /**
   * Checks if the access token is currently valid (not expired).
   *
   * This is a convenience method that returns the inverse of `isExpired`.
   * A valid token can be used for authenticated API requests.
   *
   * @returns True if the token is valid and can be used, false if expired
   *
   * @example
   * ```typescript
   * const token = AccessToken.parse(jwtString);
   *
   * if (token.isValid) {
   *   // Token is good to use for API calls
   *   await makeAuthenticatedRequest(token.toString());
   * } else {
   *   // Need to refresh or re-authenticate
   *   await refreshToken();
   * }
   * ```
   *
   * @public
   */
  get isValid() {
    return !this.isExpired;
  }

  /**
   * Returns the raw JWT token string.
   *
   * Gets the original token string that was used to create this AccessToken
   * instance. This is typically used in Authorization headers for API requests.
   *
   * @returns The raw JWT token string
   *
   * @example
   * ```typescript
   * const token = AccessToken.parse(jwtString);
   *
   * // Use token in Authorization header
   * const headers = {
   *   'Authorization': `Bearer ${token.toString()}`
   * };
   *
   * // Make authenticated request
   * const response = await fetch('/api/data', { headers });
   * ```
   *
   * @public
   */
  toString() {
    return this._raw;
  }
}
