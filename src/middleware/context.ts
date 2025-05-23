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
    request.header('X-Calljmp-Platform', Platform.OS);
    if (config.development?.enabled && config.development?.apiToken) {
      request.header(
        'X-Calljmp-Development-Api-Token',
        config.development.apiToken
      );
    }
    return next(request);
  };
}
