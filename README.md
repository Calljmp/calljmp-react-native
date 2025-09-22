# Calljmp React Native SDK

**Secure backend-as-a-service for mobile developers. No API keys. Full SQLite control.**

[![npm version](https://img.shields.io/npm/v/@calljmp/react-native)](https://www.npmjs.com/package/@calljmp/react-native)
[![GitHub license](https://img.shields.io/github/license/Calljmp/calljmp-react-native)](LICENSE)

## Overview

**Calljmp** is a secure backend-as-a-service designed for mobile developers. The **React Native SDK** provides seamless integration with Calljmp services for your React Native applications.

### Key Features

- **AI text generation** and chat capabilities
- **Authentication** via **App Attestation (iOS)** and **Play Integrity (Android)**
- **Full SQLite database access** with no restrictions - run raw SQL
- **Secure cloud storage** with organized bucket management
- **Real-time database subscriptions** for live data updates
- **Dynamic permissions** for users & roles
- **OAuth integration** (Apple, Google, and more)
- **Custom service endpoints** for your business logic

**Website**: [calljmp.com](https://calljmp.com)  
**Documentation**: [docs.calljmp.com](https://docs.calljmp.com)  
**Follow**: [@calljmpdev](https://x.com/calljmpdev)

---

## Installation

Install the SDK via npm:

```sh
npm install @calljmp/react-native
```

or via yarn:

```sh
yarn add @calljmp/react-native
```

---

## Getting Started

Initialize Calljmp in your React Native app and start using its features:

```typescript
import { Calljmp } from '@calljmp/react-native';

const calljmp = new Calljmp();
```

### Available Features

- **User Authentication**: Email/password, OAuth providers (Apple, Google)
- **Database Operations**: Direct SQLite queries, real-time subscriptions
- **Cloud Storage**: File upload, download, metadata management
- **Real-time Messaging**: Instant communication between users
- **Custom Services**: Call your own backend endpoints
- **Security**: App Attestation and Play Integrity verification

For detailed usage examples, API reference, and comprehensive guides, visit our [documentation](https://docs.calljmp.com).

## Security & App Attestation

Calljmp doesn't use API keys. Instead, it relies on **App Attestation (iOS)** and **Play Integrity (Android)** to verify that only legitimate apps can communicate with the backend.

Learn more about security in our [documentation](https://docs.calljmp.com/security).

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support & Community

If you have any questions or feedback:

- Follow [@calljmpdev](https://x.com/calljmpdev)
- Join the [Calljmp Discord](https://discord.gg/DHsrADPUC6)
- Open an issue in the [GitHub repo](https://github.com/Calljmp/calljmp-react-native/issues)
