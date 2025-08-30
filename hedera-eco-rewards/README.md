# Hedera Eco-Rewards System

A decentralized backend platform that leverages Hedera Hashgraph services to manage user identities, verify cleanup activities, mint reward tokens, and maintain transparent audit trails for the ShebaGreen environmental initiative.

## Architecture

This project follows Clean Architecture principles with clear separation of concerns:

- **Domain Layer**: Core business logic, entities, value objects, and domain services
- **Application Layer**: Use cases, commands, queries, and event handlers
- **Infrastructure Layer**: External integrations (Hedera, database, messaging)
- **Interface Layer**: API controllers, GraphQL resolvers, WebSocket handlers

## Project Structure

```
src/
├── domain/                 # Core business logic
│   ├── entities/          # Business entities
│   ├── value-objects/     # Immutable value objects
│   ├── aggregates/        # Domain aggregates
│   ├── services/          # Domain services
│   ├── repositories/      # Repository interfaces
│   └── events/            # Domain events
├── application/           # Application layer
│   ├── use-cases/         # Business use cases
│   ├── commands/          # CQRS command handlers
│   ├── queries/           # CQRS query handlers
│   └── events/            # Event handlers
├── infrastructure/        # External concerns
│   ├── hedera/            # Hedera Hashgraph integrations
│   ├── persistence/       # Database and caching
│   ├── messaging/         # Message queues
│   └── security/          # Security implementations
├── interfaces/            # External interfaces
│   ├── api/               # REST API controllers
│   ├── graphql/           # GraphQL schema and resolvers
│   └── websocket/         # WebSocket handlers
└── shared/                # Shared utilities
    ├── config/            # Configuration management
    ├── container/         # Dependency injection
    ├── types/             # Shared type definitions
    ├── utils/             # Utility functions
    └── constants/         # Application constants
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- TypeScript 5+
- PostgreSQL 14+
- Redis 6+
- Hedera Testnet Account

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd hedera-eco-rewards
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration values
```

4. Build the project:
```bash
npm run build
```

### Development

Start the development server:
```bash
npm run start:dev
```

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with coverage:
```bash
npm run test:coverage
```

### Code Quality

Lint the code:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

Format code:
```bash
npm run format
```

Check formatting:
```bash
npm run format:check
```

## Configuration

The application uses environment variables for configuration. See `.env.example` for all available options.

Key configuration sections:
- **Database**: PostgreSQL connection settings
- **Redis**: Caching configuration
- **Hedera**: Network settings and account credentials
- **Security**: JWT secrets and encryption keys
- **API**: Server settings and CORS configuration
- **Logging**: Log levels and output configuration
- **External Services**: AI verification and notification services

## Hedera Integration

This system integrates with three core Hedera services:

1. **Hedera Token Service (HTS)**: For EcoToken management
2. **Hedera Consensus Service (HCS)**: For audit trails
3. **Hedera DID Service**: For decentralized identity management

## Testing

The project includes comprehensive testing:

- **Unit Tests**: Test individual components and business logic
- **Integration Tests**: Test service integrations and database operations
- **End-to-End Tests**: Test complete user workflows

Run specific test types:
```bash
npm test -- --grep "unit"
npm test -- --grep "integration"
npm test -- --grep "e2e"
```

## Deployment

The application is containerized and can be deployed using Docker:

```bash
docker build -t hedera-eco-rewards .
docker run -p 3000:3000 hedera-eco-rewards
```

For production deployment, use the provided Kubernetes manifests or Docker Compose files.

## Contributing

1. Follow the established architecture patterns
2. Write tests for all new functionality
3. Ensure code passes linting and formatting checks
4. Update documentation as needed

## Security

- Never commit private keys or sensitive configuration
- Use environment variables for all secrets
- Follow secure coding practices
- Regularly update dependencies

## License

MIT License - see LICENSE file for details.