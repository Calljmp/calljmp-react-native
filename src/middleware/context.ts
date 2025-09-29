import { Platform } from 'react-native';
import { Config } from '../config';
import { HttpRequest, HttpResponse } from '../request';

/**
 * Middleware that attaches platform and development headers to outgoing requests.
 * @param config SDK configuration
 * @returns Middleware function for HTTP requests
 */
export function context(config: Config) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    for (const [key, value] of Object.entries(makeContext(config))) {
      request.header(key, value);
    }
    return next(request);
  };
}

export function makeContext(_config: Config): Record<string, string> {
  const data: Record<string, string> = {
    'X-Calljmp-Platform': Platform.OS,
  };
  return data;
}
