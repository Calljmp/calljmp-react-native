/**
 * @fileoverview HTTP request and response handling utilities for the Calljmp SDK.
 *
 * This module provides a comprehensive HTTP client with middleware support, request builders,
 * and response parsers. It handles JSON parsing, error handling, and provides a fluent API
 * for making HTTP requests to the backend services.
 *
 * The main components include:
 * - `HttpResponse`: Wraps fetch Response with helper methods for parsing data
 * - `HttpResult`: Represents a pending or completed HTTP request
 * - `HttpRequest`: Fluent request builder with middleware support
 * - `request()`: Factory function for creating new requests
 *
 * @example Basic HTTP request
 * ```typescript
 * // Simple GET request
 * const result = request('https://api.calljmp.com/data').get();
 * const { data, error } = await result.json<MyDataType>();
 *
 * if (error) {
 *   console.error('Request failed:', error.message);
 * } else {
 *   console.log('Data received:', data);
 * }
 * ```
 *
 * @example POST request with data
 * ```typescript
 * // POST request with JSON body
 * const result = request('https://api.calljmp.com/users')
 *   .header('Authorization', 'Bearer token')
 *   .post({ name: 'John', email: 'john@example.com' });
 *
 * const { data, error } = await result.json<User>();
 * ```
 *
 * @example Using middleware
 * ```typescript
 * // Add authentication middleware
 * const authMiddleware: HttpRequestMiddleware = async (req, next) => {
 *   req.header('Authorization', 'Bearer ' + await getToken());
 *   return next(req);
 * };
 *
 * const result = request('/api/protected')
 *   .use(authMiddleware)
 *   .get();
 * ```
 *
 * @public
 */

import { Buffer } from 'buffer';
import { ServiceError } from './common';

/**
 * Represents an HTTP response from the backend API with helper methods for parsing data.
 *
 * The HttpResponse class wraps the standard fetch Response object and provides
 * convenient methods for parsing response data as JSON, Buffer, or Blob.
 * It also handles error responses and ServiceError parsing.
 *
 * @example
 * ```typescript
 * const response = new HttpResponse(fetchResponse);
 *
 * // Check response status
 * if (response.status === 200) {
 *   const { data, error } = await response.json<MyType>();
 *   if (error) {
 *     console.error('Service error:', error.message);
 *   } else {
 *     console.log('Success:', data);
 *   }
 * }
 *
 * // Get response headers
 * const contentType = response.header('Content-Type');
 * ```
 *
 * @public
 */
export class HttpResponse {
  private _response: Response;
  private _cachedBuffer: Buffer | null = null;

  /**
   * Creates a new HttpResponse instance wrapping a fetch Response.
   *
   * @param response - The fetch API Response object to wrap
   *
   * @internal
   */
  constructor(response: Response) {
    this._response = response;
  }

  /**
   * Gets the HTTP response headers.
   *
   * Returns the Headers object containing all response headers.
   *
   * @returns The response headers as a Headers object
   *
   * @example
   * ```typescript
   * const headers = response.headers;
   * const contentType = headers.get('Content-Type');
   * ```
   *
   * @public
   */
  get headers(): Headers {
    return this._response.headers;
  }

  /**
   * Gets the value of a specific response header.
   *
   * @param name - The case-insensitive header name to retrieve
   * @returns The header value, or null if not found
   *
   * @example
   * ```typescript
   * const contentType = response.header('Content-Type');
   * const authHeader = response.header('Authorization');
   *
   * if (contentType === 'application/json') {
   *   // Handle JSON response
   * }
   * ```
   *
   * @public
   */
  header(name: string): string | null {
    return this._response.headers.get(name);
  }

  /**
   * Gets the HTTP response status code.
   *
   * @returns The HTTP status code (e.g., 200, 404, 500)
   *
   * @example
   * ```typescript
   * if (response.status === 200) {
   *   console.log('Success!');
   * } else if (response.status >= 400) {
   *   console.error('Client or server error');
   * }
   * ```
   *
   * @public
   */
  get status(): number {
    return this._response.status;
  }

  /**
   * Gets the HTTP response status text.
   *
   * @returns The HTTP status text (e.g., 'OK', 'Not Found', 'Internal Server Error')
   *
   * @example
   * ```typescript
   * console.log(`${response.status} ${response.statusText}`);
   * // Output: "404 Not Found"
   * ```
   *
   * @public
   */
  get statusText(): string {
    return this._response.statusText;
  }

  /**
   * Returns the response body as a Buffer.
   *
   * Converts the response body to a Node.js Buffer for binary data handling.
   * The result is cached to avoid multiple conversions.
   *
   * @returns Promise resolving to the response body as a Buffer
   *
   * @example
   * ```typescript
   * const buffer = await response.buffer();
   * const text = buffer.toString('utf-8');
   * const base64 = buffer.toString('base64');
   * ```
   *
   * @public
   */
  async buffer(): Promise<Buffer> {
    if (!this._cachedBuffer) {
      const arrayBuffer = await this._response.arrayBuffer();
      this._cachedBuffer = Buffer.from(arrayBuffer);
    }
    return this._cachedBuffer;
  }

  /**
   * Parses the response as JSON and handles service errors.
   *
   * Attempts to parse the response body as JSON. If the response contains
   * an error field, it's converted to a ServiceError. Otherwise, returns
   * the parsed data.
   *
   * @typeParam T - The expected type of the successful response data
   * @returns Promise resolving to either the parsed data or a ServiceError
   *
   * @example
   * ```typescript
   * const { data, error } = await response.json<User>();
   *
   * if (error) {
   *   console.error('Service error:', error.message);
   *   // Handle specific error types
   *   if (error.code === 'VALIDATION_ERROR') {
   *     // Handle validation errors
   *   }
   * } else {
   *   console.log('User data:', data);
   * }
   * ```
   *
   * @public
   */
  async json<T>(): Promise<
    { data: T; error: undefined } | { data: undefined; error: ServiceError }
  > {
    const buffer = await this.buffer();
    const text = buffer.toString('utf-8');
    const json = JSON.parse(text);
    if (json.error) {
      return { data: undefined, error: ServiceError.fromJson(json.error) };
    }
    return { data: json, error: undefined };
  }

  /**
   * Returns the response body as a Blob.
   *
   * Converts the response body to a Blob for file or binary data handling.
   * Useful for downloading files or working with binary content.
   *
   * @returns Promise resolving to the response body as a Blob
   *
   * @example
   * ```typescript
   * const blob = await response.blob();
   * const url = URL.createObjectURL(blob);
   *
   * // Use for file downloads or displaying images
   * const link = document.createElement('a');
   * link.href = url;
   * link.download = 'file.pdf';
   * link.click();
   * ```
   *
   * @public
   */
  async blob(): Promise<Blob> {
    return this._response.blob();
  }
}

/**
 * Represents a pending or resolved HTTP request with helper methods for parsing responses.
 *
 * The HttpResult class provides a promise-like interface for HTTP requests, allowing
 * you to chain response parsing methods. It caches the resolved response to avoid
 * multiple network calls when accessing the response data multiple times.
 *
 * @example
 * ```typescript
 * // Create and execute request
 * const result = request('/api/users').get();
 *
 * // Parse as JSON
 * const { data, error } = await result.json<User[]>();
 *
 * // Or get raw response
 * const response = await result.call();
 * console.log('Status:', response.status);
 *
 * // Get binary data
 * const buffer = await result.buffer();
 * const blob = await result.blob();
 * ```
 *
 * @public
 */
export class HttpResult {
  private _pendingResponse: Promise<HttpResponse>;
  private _resolvedResponse: HttpResponse | null = null;

  constructor(response: Promise<HttpResponse>) {
    this._pendingResponse = response;
  }

  /**
   * Resolves the HTTP request and returns the HttpResponse.
   *
   * Executes the request if not already resolved and caches the result
   * for subsequent calls. This is useful when you need access to the
   * raw response object for headers, status codes, etc.
   *
   * @returns Promise resolving to the HttpResponse
   *
   * @example
   * ```typescript
   * const result = request('/api/data').get();
   * const response = await result.call();
   *
   * console.log('Status:', response.status);
   * console.log('Headers:', response.headers);
   *
   * if (response.status === 200) {
   *   const { data } = await response.json<MyData>();
   * }
   * ```
   *
   * @public
   */
  async call() {
    if (!this._resolvedResponse) {
      this._resolvedResponse = await this._pendingResponse;
    }
    return this._resolvedResponse;
  }

  /**
   * Resolves the HTTP request and returns the response body as a Buffer.
   *
   * Convenience method that resolves the request and converts the response
   * body to a Buffer for binary data handling.
   *
   * @returns Promise resolving to the response body as a Buffer
   *
   * @example
   * ```typescript
   * const result = request('/api/file').get();
   * const buffer = await result.buffer();
   *
   * // Save to file or process binary data
   * const text = buffer.toString('utf-8');
   * const base64 = buffer.toString('base64');
   * ```
   *
   * @public
   */
  async buffer() {
    const response = await this.call();
    return await response.buffer();
  }

  /**
   * Resolves the HTTP request and parses the response as JSON with optional transformation.
   *
   * This method handles the complete request lifecycle: executes the request,
   * parses the JSON response, handles service errors, and optionally transforms
   * the data using a provided function.
   *
   * @typeParam T - The expected type of the response data after transformation
   * @param fn - Optional function to transform the raw JSON data
   * @returns Promise resolving to either the parsed/transformed data or a ServiceError
   *
   * @example Basic JSON parsing
   * ```typescript
   * const result = request('/api/users').get();
   * const { data, error } = await result.json<User[]>();
   *
   * if (error) {
   *   console.error('Request failed:', error.message);
   * } else {
   *   console.log('Users:', data);
   * }
   * ```
   *
   * @example With data transformation
   * ```typescript
   * const result = request('/api/user/123').get();
   * const { data, error } = await result.json<User>(raw => ({
   *   ...raw,
   *   fullName: `${raw.firstName} ${raw.lastName}`
   * }));
   * ```
   *
   * @public
   */
  async json<T>(fn?: (json: Record<string, any>) => T) {
    const response = await this.call();
    const json = await response.json<T>();

    if (json.data) {
      return {
        data: fn ? fn(json.data as Record<string, unknown>) : json.data,
        error: undefined,
      };
    }

    return {
      data: undefined,
      error: json.error as ServiceError,
    };
  }

  /**
   * Resolves the HTTP request and returns the response body as a Blob.
   *
   * Convenience method that resolves the request and converts the response
   * body to a Blob for file handling or binary data processing.
   *
   * @returns Promise resolving to the response body as a Blob
   *
   * @example
   * ```typescript
   * const result = request('/api/download/file.pdf').get();
   * const blob = await result.blob();
   *
   * // Create download link
   * const url = URL.createObjectURL(blob);
   * const link = document.createElement('a');
   * link.href = url;
   * link.download = 'file.pdf';
   * link.click();
   *
   * // Clean up
   * URL.revokeObjectURL(url);
   * ```
   *
   * @public
   */
  async blob() {
    const response = await this.call();
    return await response.blob();
  }
}

/**
 * Supported HTTP methods for API requests.
 *
 * @public
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD';

/**
 * Middleware function for intercepting and modifying HTTP requests.
 *
 * Middleware functions are executed in reverse order (last added first) and
 * can modify the request, add headers, handle authentication, logging, etc.
 * Each middleware must call `next()` to continue the chain.
 *
 * @param request - The current HttpRequest instance being processed
 * @param next - Function to call the next middleware or execute the final request
 * @returns Promise resolving to an HttpResponse
 *
 * @example Authentication middleware
 * ```typescript
 * const authMiddleware: HttpRequestMiddleware = async (req, next) => {
 *   const token = await getAuthToken();
 *   req.header('Authorization', `Bearer ${token}`);
 *   return next(req);
 * };
 * ```
 *
 * @example Logging middleware
 * ```typescript
 * const logMiddleware: HttpRequestMiddleware = async (req, next) => {
 *   console.log(`Making ${req.method} request to ${req.url}`);
 *   const response = await next(req);
 *   console.log(`Response: ${response.status}`);
 *   return response;
 * };
 * ```
 *
 * @public
 */
export type HttpRequestMiddleware = (
  request: HttpRequest,
  next: (request: HttpRequest) => Promise<HttpResponse>
) => Promise<HttpResponse>;

type JsonPrimitive = string | number | boolean | null | undefined;
type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue }
  | Record<string, unknown>;
type NotJsonValue = bigint | symbol;
type JsonLike<T> = unknown extends T
  ? never
  : {
      [P in keyof T]: T[P] extends JsonValue
        ? T[P]
        : T[P] extends NotJsonValue
          ? never
          : JsonLike<T[P]>;
    };

/**
 * Type representing valid JSON request body data.
 *
 * @public
 */
export type HttpRequestBody = JsonValue;

/**
 * Fluent HTTP request builder with chainable methods and middleware support.
 *
 * The HttpRequest class provides a fluent API for building HTTP requests with
 * support for query parameters, headers, request body, and middleware. It
 * handles JSON serialization, form data, and provides convenient methods
 * for all standard HTTP methods.
 *
 * @example Basic request building
 * ```typescript
 * const result = request('https://api.example.com/users')
 *   .params({ page: 1, limit: 10 })
 *   .header('Accept', 'application/json')
 *   .get();
 *
 * const { data, error } = await result.json<User[]>();
 * ```
 *
 * @example POST request with body
 * ```typescript
 * const result = request('/api/users')
 *   .header('Content-Type', 'application/json')
 *   .post({ name: 'John', email: 'john@example.com' });
 * ```
 *
 * @example Using middleware
 * ```typescript
 * const result = request('/api/protected')
 *   .use(authMiddleware, loggingMiddleware)
 *   .get();
 * ```
 *
 * @example Conditional request building
 * ```typescript
 * const result = request('/api/data')
 *   .$if(includeMetadata, req => req.params({ include: 'metadata' }))
 *   .get();
 * ```
 *
 * @public
 */
export class HttpRequest {
  private _url: Promise<string>;
  private _method: HttpMethod;
  private _params?: Record<
    string,
    string | number | boolean | undefined | null
  >;
  private _headers?: Record<string, string>;
  private _body?: HttpRequestBody;
  private _middlewares: HttpRequestMiddleware[] = [];

  constructor(url: string | Promise<string>) {
    this._url = typeof url === 'string' ? Promise.resolve(url) : url;
    this._method = 'GET';
  }

  /**
   * Sets query parameters for the request URL.
   *
   * Query parameters are appended to the URL as a query string. Null and
   * undefined values are filtered out automatically.
   *
   * @param params - Object containing key-value pairs for query parameters
   * @returns The current HttpRequest instance for method chaining
   *
   * @example
   * ```typescript
   * request('/api/users')
   *   .params({
   *     page: 1,
   *     limit: 10,
   *     active: true,
   *     filter: null // This will be ignored
   *   })
   *   .get();
   * // Results in: /api/users?page=1&limit=10&active=true
   * ```
   *
   * @public
   */
  params(
    params: Record<string, string | number | boolean | undefined | null>
  ): HttpRequest {
    this._params = params;
    return this;
  }

  /**
   * Sets multiple headers for the request.
   *
   * Replaces all existing headers with the provided header object.
   * Use `header()` method to set individual headers without replacing others.
   *
   * @param headers - Object containing header name-value pairs
   * @returns The current HttpRequest instance for method chaining
   *
   * @example
   * ```typescript
   * request('/api/data')
   *   .headers({
   *     'Accept': 'application/json',
   *     'Content-Type': 'application/json',
   *     'X-API-Key': 'your-api-key'
   *   })
   *   .get();
   * ```
   *
   * @public
   */
  headers(headers: Record<string, string>): HttpRequest {
    this._headers = headers;
    return this;
  }

  /**
   * Sets a single header for the request.
   *
   * Adds or overwrites a specific header while preserving other existing headers.
   *
   * @param name - The header name
   * @param value - The header value
   * @returns The current HttpRequest instance for method chaining
   *
   * @example
   * ```typescript
   * request('/api/data')
   *   .header('Authorization', 'Bearer token123')
   *   .header('Accept', 'application/json')
   *   .get();
   * ```
   *
   * @public
   */
  header(name: string, value: string): HttpRequest {
    this._headers = { ...this._headers, [name]: value };
    return this;
  }

  /**
   * Conditionally applies a transformation function to the request.
   *
   * This utility method allows for conditional request building based on
   * runtime conditions, making it easier to build dynamic requests.
   *
   * @param condition - Boolean condition to evaluate
   * @param f - Function to apply to the request if condition is true
   * @returns The current HttpRequest instance for method chaining
   *
   * @example
   * ```typescript
   * const includeMetadata = user.hasPermission('metadata');
   *
   * request('/api/users')
   *   .$if(includeMetadata, req => req.params({ include: 'metadata' }))
   *   .$if(user.isAdmin, req => req.header('X-Admin', 'true'))
   *   .get();
   * ```
   *
   * @public
   */
  $if(condition: boolean, f: (req: HttpRequest) => HttpRequest): HttpRequest {
    return condition ? f(this) : this;
  }

  /**
   * Adds middleware functions to the request processing pipeline.
   *
   * Middleware functions are executed in reverse order (last added first)
   * and can intercept, modify, or wrap the request execution. Common use
   * cases include authentication, logging, error handling, and request/response transformation.
   *
   * @param middlewares - One or more middleware functions to add
   * @returns The current HttpRequest instance for method chaining
   *
   * @example
   * ```typescript
   * request('/api/protected')
   *   .use(authMiddleware, loggingMiddleware, retryMiddleware)
   *   .get();
   * ```
   *
   * @example Custom middleware
   * ```typescript
   * const timingMiddleware: HttpRequestMiddleware = async (req, next) => {
   *   const start = Date.now();
   *   const response = await next(req);
   *   console.log(`Request took ${Date.now() - start}ms`);
   *   return response;
   * };
   *
   * request('/api/data').use(timingMiddleware).get();
   * ```
   *
   * @public
   */
  use(...middlewares: HttpRequestMiddleware[]): HttpRequest {
    this._middlewares.push(...middlewares);
    return this;
  }

  /**
   * Sets or transforms the request body using a transformation function.
   *
   * The transformation function receives the current body (or empty object if none)
   * and should return the new body. This allows for dynamic body building.
   *
   * @param fn - Function to transform the current request body
   * @returns The current HttpRequest instance for method chaining
   *
   * @example
   * ```typescript
   * request('/api/users')
   *   .body(current => ({ ...current, timestamp: Date.now() }))
   *   .body(current => ({ ...current, source: 'mobile-app' }))
   *   .post();
   * ```
   *
   * @public
   */
  body(fn: (body: HttpRequestBody) => HttpRequestBody): HttpRequest {
    this._body = fn(this._body ?? {});
    return this;
  }

  private async _executeRequest(request: HttpRequest): Promise<HttpResponse> {
    const params = new URLSearchParams();
    if (request._params) {
      for (const [key, value] of Object.entries(request._params)) {
        if (value !== undefined && value !== null) {
          params.append(key, value.toString());
        }
      }
    }

    const requestUrl = await request._url;
    const paramsString = params.toString();
    const url = `${requestUrl}${
      paramsString.length > 0 ? `?${paramsString}` : ''
    }`;
    const body = (() => {
      if (request._body instanceof FormData) {
        return request._body;
      } else if (
        request._body &&
        request._headers?.['Content-Type'] === 'application/json'
      ) {
        return JSON.stringify(request._body);
      } else {
        return undefined;
      }
    })();

    const response = await fetch(url, {
      credentials: 'include',
      headers: request._headers,
      method: request._method,
      body,
    });

    return new HttpResponse(response);
  }

  private async _call(): Promise<HttpResponse> {
    let index = this._middlewares.length - 1;
    const next = async (req: HttpRequest): Promise<HttpResponse> => {
      if (index >= 0) {
        const middleware = this._middlewares[index--];
        return middleware(req, next);
      } else {
        return this._executeRequest(req);
      }
    };
    return next(this);
  }

  private _withBody<T>(data: HttpRequestBody | JsonLike<T>): HttpRequest {
    this._body = data;
    if (!(data instanceof FormData)) {
      this._headers = {
        ...this._headers,
        'Content-Type': 'application/json',
      };
    }
    return this;
  }

  /**
   * Sends a POST request with the specified data.
   *
   * POST requests are typically used for creating new resources or submitting
   * data to the server. The data is serialized as JSON unless it's FormData.
   *
   * @param data - The request body data to send (defaults to empty object)
   * @returns HttpResult instance for handling the response
   *
   * @example JSON data
   * ```typescript
   * const result = request('/api/users')
   *   .post({ name: 'John', email: 'john@example.com' });
   *
   * const { data, error } = await result.json<User>();
   * ```
   *
   * @example Form data
   * ```typescript
   * const formData = new FormData();
   * formData.append('file', fileBlob);
   * formData.append('title', 'My File');
   *
   * const result = request('/api/upload').post(formData);
   * ```
   *
   * @public
   */
  post<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'POST';
    return new HttpResult(this._withBody(data)._call());
  }

  /**
   * Sends a PUT request with the specified data.
   *
   * PUT requests are typically used for updating or replacing existing
   * resources. The entire resource representation should be included.
   *
   * @param data - The request body data to send (defaults to empty object)
   * @returns HttpResult instance for handling the response
   *
   * @example
   * ```typescript
   * const result = request('/api/users/123')
   *   .put({
   *     id: 123,
   *     name: 'John Updated',
   *     email: 'john.updated@example.com'
   *   });
   *
   * const { data, error } = await result.json<User>();
   * ```
   *
   * @public
   */
  put<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'PUT';
    return new HttpResult(this._withBody(data)._call());
  }

  /**
   * Sends a PATCH request with the specified data.
   *
   * PATCH requests are used for partial updates of existing resources.
   * Only the fields that need to be updated should be included.
   *
   * @param data - The partial data to update (defaults to empty object)
   * @returns HttpResult instance for handling the response
   *
   * @example
   * ```typescript
   * const result = request('/api/users/123')
   *   .patch({ name: 'New Name' }); // Only update the name field
   *
   * const { data, error } = await result.json<User>();
   * ```
   *
   * @public
   */
  patch<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'PATCH';
    return new HttpResult(this._withBody(data)._call());
  }

  /**
   * Sends a DELETE request.
   *
   * DELETE requests are used to remove or delete existing resources.
   * No request body is typically sent with DELETE requests.
   *
   * @returns HttpResult instance for handling the response
   *
   * @example
   * ```typescript
   * const result = request('/api/users/123').delete();
   *
   * const { data, error } = await result.json();
   * if (!error) {
   *   console.log('User deleted successfully');
   * }
   * ```
   *
   * @public
   */
  delete(): HttpResult {
    this._method = 'DELETE';
    return new HttpResult(this._call());
  }

  /**
   * Sends a GET request.
   *
   * GET requests are used to retrieve data from the server. They should
   * not have side effects and can be cached by browsers and proxies.
   *
   * @returns HttpResult instance for handling the response
   *
   * @example
   * ```typescript
   * const result = request('/api/users')
   *   .params({ page: 1, limit: 10 })
   *   .get();
   *
   * const { data, error } = await result.json<User[]>();
   * ```
   *
   * @public
   */
  get(): HttpResult {
    this._method = 'GET';
    return new HttpResult(this._call());
  }

  /**
   * Sends a HEAD request.
   *
   * HEAD requests are identical to GET requests except the server returns
   * only headers without the response body. Useful for checking if a resource
   * exists or getting metadata without downloading the full content.
   *
   * @returns HttpResult instance for handling the response
   *
   * @example
   * ```typescript
   * const result = request('/api/large-file').head();
   * const response = await result.call();
   *
   * const contentLength = response.header('Content-Length');
   * const lastModified = response.header('Last-Modified');
   *
   * console.log(`File size: ${contentLength} bytes`);
   * ```
   *
   * @public
   */
  head(): HttpResult {
    this._method = 'HEAD';
    return new HttpResult(this._call());
  }
}

/**
 * Creates a new HttpRequest instance for the specified URL.
 *
 * This is the main entry point for creating HTTP requests. It accepts either
 * a string URL or a Promise that resolves to a URL, allowing for dynamic
 * URL construction.
 *
 * @param url - The request URL string or a Promise resolving to a URL
 * @returns A new HttpRequest instance ready for method chaining
 *
 * @example Basic usage
 * ```typescript
 * const result = request('https://api.example.com/users').get();
 * const { data, error } = await result.json<User[]>();
 * ```
 *
 * @example With Promise URL
 * ```typescript
 * const urlPromise = getApiEndpoint().then(base => `${base}/users`);
 * const result = request(urlPromise).get();
 * ```
 *
 * @example Method chaining
 * ```typescript
 * const result = request('/api/users')
 *   .params({ page: 1, limit: 10 })
 *   .header('Authorization', 'Bearer token')
 *   .use(loggingMiddleware)
 *   .get();
 * ```
 *
 * @public
 */
export function request(url: string | Promise<string>) {
  return new HttpRequest(url);
}
