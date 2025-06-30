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
    for (const [key, value] of Object.entries(await makeAccess(store))) {
      request.header(key, value);
    }

    const response = await next(request);

    const refreshAccessToken = response.header('X-Calljmp-Access-Token');
    if (refreshAccessToken) {
      await store.put('accessToken', refreshAccessToken);
    }

    return response;
  };
}

export async function makeAccess(store: SecureStore) {
  const data: Record<string, string> = {};
  const accessToken = await store.get('accessToken');
  if (accessToken) {
    data['Authorization'] = `Bearer ${accessToken}`;
  }
  return data;
}
