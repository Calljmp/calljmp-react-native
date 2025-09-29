import { AccessToken } from '../access';
import { ServiceError, ServiceErrorCode } from '../common';
import { Config } from '../config';
import { HttpRequest, HttpResponse } from '../request';
import { AccessResolver } from '../utils/access-resolver';
import NativeDevice from '../specs/NativeCalljmpDevice';
import { Platform } from 'react-native';

/**
 * Middleware that attaches the access token to outgoing requests and
 * updates the stored access token if a new one is received in the response.
 * @param context SDK configuration
 * @param store SecureStore instance for token management
 * @returns Middleware function for HTTP requests
 */
export function access(config: Config, access: AccessResolver) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    for (const [key, value] of Object.entries(
      await makeAccess(config, access)
    )) {
      request.header(key, value);
    }

    const response = await next(request);
    await postAccess(config, access, response);

    return response;
  };
}

export async function postAccess(
  _config: Config,
  access: AccessResolver,
  response: HttpResponse | string | Record<string, any>
) {
  const handleError = async (error: Record<string, any>) => {
    const serviceError = ServiceError.fromJson(error);
    if (serviceError.code === ServiceErrorCode.Unauthorized) {
      await access.clear().catch(() => {
        // Ignore
      });
    }
  };

  if (typeof response === 'object' && 'status' in response) {
    const refreshAccessToken = response.header('X-Calljmp-Access-Token');
    if (refreshAccessToken) {
      const { data: token, error } = AccessToken.tryParse(refreshAccessToken);
      if (token) {
        await access.put(token);
      } else {
        console.error('Received invalid access token from server', error);
      }
    }

    if (response.status >= 400) {
      if (response.header('Content-Type') === 'application/json') {
        const json = await response.json();
        if (json && typeof json === 'object' && 'error' in json) {
          await handleError(json.error);
        } else if (response.status === 401) {
          await access.clear().catch(() => {
            // Ignore
          });
        }
      }
    }
  } else if (typeof response === 'object' && 'error' in response) {
    await handleError(response.error);
  } else if (typeof response === 'string') {
    try {
      const json = JSON.parse(response);
      if (json && typeof json === 'object' && 'error' in json) {
        await handleError(json.error);
      }
    } catch {
      // Not JSON, ignore
    }
  }
}

export async function makeAccess(_config: Config, access: AccessResolver) {
  const data: Record<string, string> = {};

  const { data: accessToken } = await access.resolve();
  if (accessToken) {
    data['Authorization'] = `Bearer ${accessToken}`;
  }

  return data;
}

export function accessSupport(config: Config) {
  return async (
    request: HttpRequest,
    next: (request: HttpRequest) => Promise<HttpResponse>
  ): Promise<HttpResponse> => {
    const response = await next(request);

    if (response.status >= 400) {
      const reportError = (message: string) => {
        console.error(message);
        throw new Error(message);
      };

      const simulator = await NativeDevice.isSimulator();

      if (simulator) {
        if (config.development?.enabled) {
          if (!config.development?.apiToken) {
            reportError(
              'Missing development API token. Please set the development API token in your SDK configuration to enable development mode.\n' +
                'You can generate a development API token from your Calljmp dashboard.\n' +
                'See https://docs.calljmp.com/sdks/installation for more details.'
            );
          }
        } else {
          reportError(
            'The application is running in a simulator/emulator but development mode is not enabled. ' +
              'Please enable development mode in your SDK configuration to allow the app to run in simulators/emulators.\n' +
              'See https://docs.calljmp.com/sdks/installation for more details.'
          );
        }
      } else {
        if (Platform.OS === 'ios') {
          reportError(
            'Not properly configured iOS applications. Please check Team ID and Bundle ID in your application configuration on Calljmp dashboard.\n' +
              'See https://docs.calljmp.com/sdks/installation for more details.'
          );
        } else if (Platform.OS === 'android') {
          reportError(
            'Not properly configured Android applications. Please check Package Name and Play Integrity (cloud project number) in your application configuration on Calljmp dashboard.\n' +
              'See https://docs.calljmp.com/sdks/installation for more details.'
          );
        }
      }
    }

    return response;
  };
}
