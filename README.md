# Calljmp React Native SDK

**Secure backend-as-a-service for mobile developers. No API keys. Full SQLite control.**

[![npm version](https://img.shields.io/npm/v/@calljmp/react-native)](https://www.npmjs.com/package/@calljmp/react-native)
[![GitHub license](https://img.shields.io/github/license/Calljmp/calljmp-react-native)](LICENSE)
[![React Native](https://img.shields.io/badge/React%20Native-Compatible-blue)](https://reactnative.dev/)

## 🚀 Overview

Calljmp is a **secure backend designed for mobile developers**, providing:

- ✅ **Authentication** via **App Attestation (iOS)** and **Play Integrity (Android)**
- ✅ **Full SQLite database access** (no restrictions, run raw SQL)
- ✅ **Dynamic permissions** for users & roles
- ✅ **React Native SDK** for seamless integration

🔹 **Website**: [calljmp.com](https://calljmp.com)  
🔹 **Follow**: [@calljmpdev](https://x.com/calljmpdev)

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

### 4️⃣ Access service

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
