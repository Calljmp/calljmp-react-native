/**
 * @fileoverview Main entry point for the Calljmp React Native SDK.
 *
 * The Calljmp SDK provides secure backend-as-a-service functionality for mobile developers,
 * featuring device attestation, SQLite database access, user authentication, and cloud storage.
 *
 * @example Basic usage
 * ```typescript
 * import { Calljmp } from '@calljmp/react-native';
 *
 * const sdk = new Calljmp({
 *   development: {
 *     enabled: __DEV__,
 *     baseUrl: 'http://localhost:3000'
 *   }
 * });
 *
 * // Connect to project
 * await sdk.project.connect();
 *
 * // Authenticate user
 * await sdk.users.auth.email.authenticate({
 *   email: 'user@example.com',
 *   password: 'password'
 * });
 *
 * // Query database
 * const result = await sdk.database.query({
 *   sql: 'SELECT * FROM users WHERE id = ?',
 *   params: [1]
 * });
 * ```
 *
 * @author Calljmp Team
 * @since 0.0.1
 */

export {
  UserAuthenticationProvider,
  UserAuthenticationPolicy,
  type User,
  ServiceErrorCode,
  ServiceError,
  Value,
} from './common';

export * from './client';

export type {
  RealtimeSubscription,
  RealtimeTopic,
  RealtimeTopicHandler,
} from './realtime';

export type {
  DatabaseRowId,
  DatabaseRow,
  DatabaseSubscriptionInsertHandler,
  DatabaseSubscriptionUpdateHandler,
  DatabaseSubscriptionDeleteHandler,
  DatabaseSubscription,
  DatabaseSubscriptionEvent,
} from './database';

export { CalljmpProvider, useCalljmp } from './context';

export { useChat } from './ai/context/chat';
export { useTextGeneration, useTextStream } from './ai/context/text';

import * as ai from './ai';
export { ai };
