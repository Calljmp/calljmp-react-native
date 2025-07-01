# Calljmp React Native SDK

**Secure backend-as-a-service for mobile developers. No API keys. Full SQLite control.**

[![npm version](https://img.shields.io/npm/v/@calljmp/react-native)](https://www.npmjs.com/package/@calljmp/react-native)
[![GitHub license](https://img.shields.io/github/license/Calljmp/calljmp-react-native)](LICENSE)
[![React Native](https://img.shields.io/badge/React%20Native-Compatible-blue)](https://reactnative.dev/)

## 🚀 Overview

Calljmp is a **secure backend designed for mobile developers**, providing:

- ✅ **Authentication** via **App Attestation (iOS)** and **Play Integrity (Android)**
- ✅ **Full SQLite database access** (no restrictions, run raw SQL)
- ✅ **Cloud storage** with file upload, download, and metadata management
- ✅ **Dynamic permissions** for users & roles
- ✅ **React Native SDK** for seamless integration

🔹 **Website**: [calljmp.com](https://calljmp.com)  
🔹 **Follow**: [@calljmpdev](https://x.com/calljmpdev)

## 📑 Table of Contents

- [🚀 Overview](#-overview)
- [📦 Installation](#-installation)
- [🛠️ Setup & Usage](#️-setup--usage)
  - [1️⃣ Initialize Calljmp](#1️⃣-initialize-calljmp)
  - [2️⃣ Authenticate User](#2️⃣-authenticate-user)
  - [3️⃣ Run Direct SQL Queries](#3️⃣-run-direct-sql-queries)
  - [4️⃣ Real-time Database Subscriptions](#4️⃣-real-time-database-subscriptions)
  - [5️⃣ Cloud Storage & File Management](#5️⃣-cloud-storage--file-management)
  - [6️⃣ OAuth Authentication](#6️⃣-oauth-authentication)
  - [7️⃣ Real-time Messaging](#7️⃣-real-time-messaging)
  - [8️⃣ Access Service](#8️⃣-access-service)
- [🔒 Security & App Attestation](#-security--app-attestation)
- [📄 License](#-license)
- [💬 Support & Community](#-support--community)

---

## 📦 Installation

Install the SDK via npm:

```sh
npm install @calljmp/react-native
```

or via yarn:

```sh
yarn add @calljmp/react-native
```

---

## 🛠️ Setup & Usage

### 1️⃣ Initialize Calljmp

Import and initialize Calljmp in your React Native app:

```typescript
import { Calljmp, UserAuthenticationPolicy } from '@calljmp/react-native';

const calljmp = new Calljmp();
```

### 2️⃣ Authenticate User

Authenticate a user with Calljmp:

```typescript
const auth = await calljmp.users.auth.email.authenticate({
  email: 'test@email.com',
  name: 'Tester',
  password: 'password',
  policy: UserAuthenticationPolicy.SignInOrCreate,
  tags: ['role:member'],
});

if (auth.error) {
  console.error(auth.error);
  return;
}

const user = auth.data.user;
console.log(`Authenticated user: ${user}`);
```

### 3️⃣ Run Direct SQL Queries

Access your SQLite database without restrictions:

```typescript
const result = await calljmp.database.query({
  sql: 'SELECT id, email, auth_provider, provider_user_id, tags, created_at FROM users',
  params: [],
});

if (result.error) {
  console.error(result.error);
  return;
}

console.log(result.data);
```

### 4️⃣ Real-time Database Subscriptions

Subscribe to database changes in real-time and react to data modifications as they happen:

```typescript
// Observe new user insertions
const insertSubscription = await calljmp.database
  .observe<User>('users.insert')
  .on('insert', ({ rows }) => {
    console.log('New users added:', rows);
    // Update your UI or trigger other actions
  })
  .subscribe();

// Observe user updates
const updateSubscription = await calljmp.database
  .observe<User>('users.update')
  .on('update', ({ rows }) => {
    console.log('Users updated:', rows);
  })
  .subscribe();

// Observe user deletions
const deleteSubscription = await calljmp.database
  .observe<User>('users.delete')
  .on('delete', ({ rowIds }) => {
    console.log('Users deleted:', rowIds);
  })
  .subscribe();

// Unsubscribe when done
await updateSubscription.unsubscribe();
await insertSubscription.unsubscribe();
await deleteSubscription.unsubscribe();
```

### 5️⃣ Cloud Storage & File Management

Calljmp provides secure cloud storage with organized bucket management. Upload, download, and manage files with metadata, tags, and access controls.

#### Upload Files

Upload files or content to storage buckets with rich metadata support:

```typescript
// Upload text content
const textFile = await calljmp.storage.upload({
  content: 'Hello, world!',
  bucketId: 'documents',
  key: 'greeting.txt',
  description: 'A simple greeting file',
  tags: ['greeting', 'text'],
  type: 'text/plain',
});

// Upload binary data (images, documents, etc.)
const imageBlob = new Blob([imageData], { type: 'image/jpeg' });
const imageFile = await calljmp.storage.upload({
  content: imageBlob,
  bucketId: 'user-photos',
  key: `photos/${Date.now()}.jpg`,
  description: 'Profile photo',
  tags: ['profile', 'photo'],
  type: 'image/jpeg',
  sha256: 'abc123...', // Optional hash for verification
});

if (imageFile.error) {
  console.error('Upload failed:', imageFile.error);
} else {
  console.log('File uploaded:', imageFile.data.key);
  console.log('File size:', imageFile.data.size);
}
```

#### Download Files

Retrieve files with support for partial downloads and streaming:

```typescript
// Download complete file
const fileBlob = await calljmp.storage.retrieve({
  bucketId: 'documents',
  key: 'greeting.txt',
});

if (fileBlob.error) {
  console.error('Download failed:', fileBlob.error);
} else {
  const content = await fileBlob.data.text();
  console.log('File content:', content);

  // Or get as ArrayBuffer for binary files
  const arrayBuffer = await fileBlob.data.arrayBuffer();
}

// Download file range (partial content) - useful for large files
const chunk = await calljmp.storage.retrieve({
  bucketId: 'videos',
  key: 'large-video.mp4',
  offset: 0,
  length: 1024 * 64, // First 64KB
});

// Streaming download for large files
const chunkSize = 64 * 1024; // 64KB chunks
let offset = 0;

while (true) {
  const result = await calljmp.storage.retrieve({
    bucketId: 'videos',
    key: 'movie.mp4',
    offset,
    length: chunkSize,
  });

  if (result.data.size === 0) break; // End of file

  // Process chunk
  await processChunk(result.data);
  offset += chunkSize;
}
```

#### File Metadata Management

Get file information without downloading content:

```typescript
// Get file metadata only (fast operation)
const fileInfo = await calljmp.storage.peek({
  bucketId: 'documents',
  key: 'report.pdf',
});

if (fileInfo.error) {
  console.error('Failed to get metadata:', fileInfo.error);
} else {
  console.log('File name:', fileInfo.data.key);
  console.log('File size:', fileInfo.data.size);
  console.log('Content type:', fileInfo.data.type);
  console.log('Description:', fileInfo.data.description);
  console.log('Tags:', fileInfo.data.tags);
  console.log('Created:', fileInfo.data.createdAt);
  console.log('Modified:', fileInfo.data.updatedAt);
}

// Update file metadata (description and tags)
const updatedFile = await calljmp.storage.update({
  bucketId: 'documents',
  key: 'report.pdf',
  description: 'Updated quarterly financial report',
  tags: ['finance', 'quarterly', '2024', 'updated'],
});

// Remove description but keep tags
await calljmp.storage.update({
  bucketId: 'temp-files',
  key: 'temp-data.json',
  description: null, // Remove description
  tags: ['temporary', 'json'],
});
```

#### List & Browse Files

Browse files in storage buckets with pagination and sorting:

```typescript
// List recent files with pagination
const fileList = await calljmp.storage.list({
  bucketId: 'user-documents',
  limit: 20,
  orderField: 'createdAt',
  orderDirection: 'desc',
});

if (fileList.error) {
  console.error('Failed to list files:', fileList.error);
} else {
  console.log(`Found ${fileList.data.files.length} files`);

  fileList.data.files.forEach(file => {
    console.log(`- ${file.key} (${file.size} bytes)`);
    console.log(`  Tags: ${file.tags?.join(', ') || 'None'}`);
    console.log(`  Created: ${file.createdAt}`);
  });

  // Check if more files are available
  if (fileList.data.nextOffset) {
    console.log(`More files available at offset ${fileList.data.nextOffset}`);

    // Load next page
    const nextPage = await calljmp.storage.list({
      bucketId: 'user-documents',
      offset: fileList.data.nextOffset,
      limit: 20,
    });
  }
}

// Get all files with pagination helper
async function getAllFiles(bucketId: string) {
  const allFiles = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const result = await calljmp.storage.list({
      bucketId,
      offset,
      limit,
    });

    if (result.error || !result.data.files.length) break;

    allFiles.push(...result.data.files);

    if (!result.data.nextOffset) break;
    offset = result.data.nextOffset;
  }

  return allFiles;
}
```

#### Delete Files

Permanently remove files from storage:

```typescript
// Delete a single file
const deleteResult = await calljmp.storage.delete({
  bucketId: 'temp-files',
  key: 'temporary-data.json',
});

if (deleteResult.error) {
  console.error('Deletion failed:', deleteResult.error);
} else {
  console.log('File successfully deleted');
}

// Delete with confirmation
async function deleteFileWithConfirmation(bucketId: string, key: string) {
  const confirmed = confirm(`Are you sure you want to delete ${key}?`);
  if (confirmed) {
    const result = await calljmp.storage.delete({ bucketId, key });
    if (result.error) {
      alert('Failed to delete file: ' + result.error.message);
    } else {
      alert('File deleted successfully');
    }
  }
}

// Batch delete files
const filesToDelete = ['old-file1.txt', 'old-file2.txt', 'old-file3.txt'];

for (const filename of filesToDelete) {
  try {
    await calljmp.storage.delete({
      bucketId: 'cleanup-bucket',
      key: filename,
    });
    console.log(`Deleted: ${filename}`);
  } catch (error) {
    console.error(`Failed to delete ${filename}:`, error);
  }
}
```

### 6️⃣ OAuth Authentication

Authenticate users with popular OAuth providers like Apple and Google:

#### Apple Sign-In

```typescript
// Apple OAuth authentication
const appleAuth = await calljmp.users.auth.apple.authenticate({
  identityToken: appleIdentityToken, // From Apple Sign-In
  policy: UserAuthenticationPolicy.SignInOrCreate,
  tags: ['role:member']
});

if (appleAuth.error) {
  console.error('Apple authentication failed:', appleAuth.error);
} else {
  console.log('Apple user authenticated:', appleAuth.data.user);
}
```

#### Google Sign-In

```typescript
// Google OAuth authentication
const googleAuth = await calljmp.users.auth.google.authenticate({
  identityToken: googleIdToken, // From Google Sign-In
  policy: UserAuthenticationPolicy.SignInOrCreate,
  tags: ['role:member']
});

if (googleAuth.error) {
  console.error('Google authentication failed:', googleAuth.error);
} else {
  console.log('Google user authenticated:', googleAuth.data.user);
}
```

### 7️⃣ Real-time Messaging

Build real-time features like user presence, notifications, and live updates using Calljmp's pub/sub messaging system:

#### User Presence System

```typescript
interface UserPresence {
  userId: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: string;
  metadata?: {
    device?: string;
    location?: string;
  };
}

// Subscribe to presence updates for all users
const presenceSubscription = await calljmp.realtime
  .observe<UserPresence>('user.presence')
  .on('data', async (topic, presenceData) => {
    console.log(`User ${presenceData.userId} is now ${presenceData.status}`);
    
    // Update your UI to show user presence
    updateUserPresenceInUI(presenceData);
  })
  .subscribe();

// Publish your own presence when app becomes active
const publishPresence = async (status: 'online' | 'away' | 'offline') => {
  await calljmp.realtime.publish({
    topic: 'user.presence',
    data: {
      userId: currentUser.id,
      status,
      lastSeen: new Date().toISOString(),
      metadata: {
        device: Platform.OS,
        location: 'main-screen'
      }
    } as UserPresence
  });
};

// Set user as online when app starts
await publishPresence('online');

// Handle app state changes
import { AppState } from 'react-native';

AppState.addEventListener('change', (nextAppState) => {
  if (nextAppState === 'active') {
    publishPresence('online');
  } else if (nextAppState === 'background') {
    publishPresence('away');
  }
});

// Clean up when user logs out
const cleanup = async () => {
  await publishPresence('offline');
  await presenceSubscription.unsubscribe();
};
```

#### Live Notifications

```typescript
interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  targetUserId?: string;
  createdAt: string;
}

// Subscribe to notifications for current user
const notificationSubscription = await calljmp.realtime
  .observe<Notification>('notifications')
  .filter({ targetUserId: currentUser.id }) // Only receive notifications for this user
  .on('data', async (topic, notification) => {
    // Show notification in your app
    showNotification({
      title: notification.title,
      message: notification.message,
      type: notification.type
    });
    
    // Store in local state for notification history
    addNotificationToHistory(notification);
  })
  .subscribe();

// Send notification to specific user
const sendNotification = async (targetUserId: string, notification: Omit<Notification, 'id' | 'createdAt' | 'targetUserId'>) => {
  await calljmp.realtime.publish({
    topic: 'notifications',
    data: {
      ...notification,
      id: crypto.randomUUID(),
      targetUserId,
      createdAt: new Date().toISOString()
    } as Notification
  });
};
```

### 8️⃣ Access Service

If you are deploying your own service, you can access it via the `service` property.

```typescript
// ./src/services/main.ts

import { Service } from './service';

const service = Service();

service.get('/hello', async c => {
  return c.json({
    message: 'Hello, world!',
  });
});

export default service;
```

then in your React Native app, you can call the service like this:

```typescript
// ./src/app/App.tsx

const result = await calljmp.service
  .request('/hello')
  .get()
  .json<{ message: string }>();

if (result.error) {
  console.error(result.error);
  return;
}

console.log(result.data);
```

## 🔒 Security & App Attestation

Calljmp does not use API keys. Instead, it relies on App Attestation (iOS) and Play Integrity (Android) to verify that only legitimate apps can communicate with the backend.

For more details, check the [Apple App Attestations docs](https://developer.apple.com/documentation/devicecheck/establishing-your-app-s-integrity) and/or [Google Play Integrity docs](https://developer.android.com/google/play/integrity).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 💬 Support & Community

If you have any questions or feedback:

- Follow [@calljmpdev](https://x.com/calljmpdev)
- Join the [Calljmp Discord](https://discord.gg/DHsrADPUC6)
- Open an issue in the [GitHub repo](https://github.com/Calljmp/calljmp-react-native/issues)
