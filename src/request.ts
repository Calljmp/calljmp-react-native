import { Buffer } from 'buffer';
import { ServiceError } from './common';

/**
 * Represents an HTTP response from the backend API, with helpers for parsing data.
 */
export class HttpResponse {
  private _response: Response;
  private _cachedBuffer: Buffer | null = null;

  /**
   * @param response Fetch API Response object
   */
  constructor(response: Response) {
    this._response = response;
  }

  /**
   * HTTP response headers
   */
  get headers(): Headers {
    return this._response.headers;
  }

  /**
   * Returns the value of a specific header.
   * @param name Header name
   * @returns Header value or null
   */
  header(name: string): string | null {
    return this._response.headers.get(name);
  }

  /**
   * HTTP status code
   */
  get status(): number {
    return this._response.status;
  }

  /**
   * HTTP status text
   */
  get statusText(): string {
    return this._response.statusText;
  }

  /**
   * Returns the response body as a Buffer.
   * @returns The response body as a Node.js Buffer.
   */
  async buffer(): Promise<Buffer> {
    if (!this._cachedBuffer) {
      const arrayBuffer = await this._response.arrayBuffer();
      this._cachedBuffer = Buffer.from(arrayBuffer);
    }
    return this._cachedBuffer;
  }

  /**
   * Parses the response as JSON and returns data or error.
   * @typeParam T - The expected type of the response data.
   * @returns An object containing either the parsed data or a ServiceError.
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
   * @returns The response body as a Blob.
   */
  async blob(): Promise<Blob> {
    return this._response.blob();
  }
}

/**
 * Represents a pending or resolved HTTP request, with helpers for parsing the response.
 */
export class HttpResult {
  private _pendingResponse: Promise<HttpResponse>;
  private _resolvedResponse: HttpResponse | null = null;

  constructor(response: Promise<HttpResponse>) {
    this._pendingResponse = response;
  }

  /**
   * Resolves the HTTP request and returns the response.
   * @returns The resolved HttpResponse.
   */
  async call() {
    if (!this._resolvedResponse) {
      this._resolvedResponse = await this._pendingResponse;
    }
    return this._resolvedResponse;
  }

  /**
   * Resolves the HTTP request and returns the response body as a Buffer.
   * @returns The response body as a Node.js Buffer.
   */
  async buffer() {
    const response = await this.call();
    return await response.buffer();
  }

  /**
   * Resolves the HTTP request and parses the response as JSON.
   * @typeParam T - The expected type of the response data.
   * @returns An object containing either the parsed data or a ServiceError.
   */
  async json<T extends Record<string, unknown> = {}>() {
    const response = await this.call();
    return await response.json<T>();
  }

  /**
   * Resolves the HTTP request and returns the response body as a Blob.
   * @returns The response body as a Blob.
   */
  async blob() {
    const response = await this.call();
    return await response.blob();
  }
}

/**
 * Supported HTTP methods for requests.
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Middleware function for HTTP requests.
 * @param request The current HttpRequest instance.
 * @param next Function to call the next middleware or execute the request.
 * @returns A promise resolving to an HttpResponse.
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

export type HttpRequestBody = JsonValue;

/**
 * Represents an HTTP request builder with chainable methods and middleware support.
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
   * Sets query parameters for the request.
   * @param params Key-value pairs for query parameters.
   * @returns The current HttpRequest instance.
   */
  params(
    params: Record<string, string | number | boolean | undefined | null>
  ): HttpRequest {
    this._params = params;
    return this;
  }

  /**
   * Sets headers for the request.
   * @param headers Key-value pairs for headers.
   * @returns The current HttpRequest instance.
   */
  headers(headers: Record<string, string>): HttpRequest {
    this._headers = headers;
    return this;
  }

  /**
   * Sets a single header for the request.
   * @param name Header name.
   * @param value Header value.
   * @returns The current HttpRequest instance.
   */
  header(name: string, value: string): HttpRequest {
    this._headers = { ...this._headers, [name]: value };
    return this;
  }

  /**
   * Conditionally applies a function to the request if the condition is true.
   * @param condition Boolean condition.
   * @param f Function to apply if condition is true.
   * @returns The current HttpRequest instance.
   */
  $if(condition: boolean, f: (req: HttpRequest) => HttpRequest): HttpRequest {
    return condition ? f(this) : this;
  }

  /**
   * Adds middleware functions to the request.
   * @param middlewares Middleware functions to add.
   * @returns The current HttpRequest instance.
   */
  use(...middlewares: HttpRequestMiddleware[]): HttpRequest {
    this._middlewares.push(...middlewares);
    return this;
  }

  /**
   * Sets or transforms the request body.
   * @param fn Function to transform the current body.
   * @returns The current HttpRequest instance.
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

  /**
   * Sends a POST request with the given data.
   * @param data The request body data.
   * @returns An HttpResult for the request.
   */
  post<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'POST';
    this._body = data;
    if (!(data instanceof FormData)) {
      this._headers = {
        ...this._headers,
        'Content-Type': 'application/json',
      };
    }
    return new HttpResult(this._call());
  }

  /**
   * Sends a PUT request with the given data.
   * @param data The request body data.
   * @returns An HttpResult for the request.
   */
  put<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'PUT';
    this._body = data;
    if (!(data instanceof FormData)) {
      this._headers = {
        ...this._headers,
        'Content-Type': 'application/json',
      };
    }
    return new HttpResult(this._call());
  }

  /**
   * Sends a DELETE request.
   * @returns An HttpResult for the request.
   */
  delete(): HttpResult {
    this._method = 'DELETE';
    return new HttpResult(this._call());
  }

  /**
   * Sends a GET request.
   * @returns An HttpResult for the request.
   */
  get(): HttpResult {
    this._method = 'GET';
    return new HttpResult(this._call());
  }
}

/**
 * Creates a new HttpRequest instance for the given URL.
 * @param url The request URL or a promise resolving to a URL.
 * @returns A new HttpRequest instance.
 */
export function request(url: string | Promise<string>) {
  return new HttpRequest(url);
}
