import { HttpRequest, HttpResponse } from '../request';
import { SecureStore } from '../secure-store';

/**
 * Middleware that attaches the access token to outgoing requests and
 * updates the stored access token if a new one is received in the response.
 * @param store SecureStore instance for token management
 * @returns Middleware function for HTTP requests
 */
export function access(store: SecureStore) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    const accessToken = await store.get('accessToken');
    if (accessToken) {
      request.header('Authorization', `Bearer ${accessToken}`);
    }

    const response = await next(request);

    const refreshAccessToken = response.header('X-Calljmp-Access-Token');
    if (refreshAccessToken) {
      await store.put('accessToken', refreshAccessToken);
    }

    return response;
  };
}
