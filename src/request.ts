import { Buffer } from 'buffer';
import { ServiceError } from './common';

export class HttpResponse {
  private _response: Response;
  private _cachedBuffer: Buffer | null = null;

  constructor(response: Response) {
    this._response = response;
  }

  get headers(): Headers {
    return this._response.headers;
  }

  get status(): number {
    return this._response.status;
  }

  get statusText(): string {
    return this._response.statusText;
  }

  async buffer(): Promise<Buffer> {
    if (!this._cachedBuffer) {
      const arrayBuffer = await this._response.arrayBuffer();
      this._cachedBuffer = Buffer.from(arrayBuffer);
    }
    return this._cachedBuffer;
  }

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
}

export class HttpResult {
  private _pendingResponse: Promise<HttpResponse>;
  private _resolvedResponse: HttpResponse | null = null;

  constructor(response: Promise<HttpResponse>) {
    this._pendingResponse = response;
  }

  async call() {
    if (!this._resolvedResponse) {
      this._resolvedResponse = await this._pendingResponse;
    }
    return this._resolvedResponse;
  }

  async buffer() {
    const response = await this.call();
    return await response.buffer();
  }

  async json<T = Record<string, unknown>>() {
    const response = await this.call();
    return await response.json<T>();
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

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

  params(
    params: Record<string, string | number | boolean | undefined | null>
  ): HttpRequest {
    this._params = params;
    return this;
  }

  headers(headers: Record<string, string>): HttpRequest {
    this._headers = headers;
    return this;
  }

  header(name: string, value: string): HttpRequest {
    this._headers = { ...this._headers, [name]: value };
    return this;
  }

  $if(condition: boolean, f: (req: HttpRequest) => HttpRequest): HttpRequest {
    return condition ? f(this) : this;
  }

  use(...middlewares: HttpRequestMiddleware[]): HttpRequest {
    this._middlewares.push(...middlewares);
    return this;
  }

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
      if (
        request._body &&
        request._headers?.['Content-Type'] === 'application/json'
      ) {
        return JSON.stringify(request._body);
      }
      return undefined;
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

  post<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'POST';
    this._body = data;
    this._headers = {
      ...this._headers,
      'Content-Type': 'application/json',
    };
    return new HttpResult(this._call());
  }

  put<T>(data: HttpRequestBody | JsonLike<T> = {}): HttpResult {
    this._method = 'PUT';
    this._body = data;
    this._headers = {
      ...this._headers,
      'Content-Type': 'application/json',
    };
    return new HttpResult(this._call());
  }

  delete(): HttpResult {
    this._method = 'DELETE';
    return new HttpResult(this._call());
  }

  get(): HttpResult {
    this._method = 'GET';
    return new HttpResult(this._call());
  }
}

export function request(url: string | Promise<string>) {
  return new HttpRequest(url);
}
