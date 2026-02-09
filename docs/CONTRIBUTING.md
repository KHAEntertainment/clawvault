# Contributing to ClawVault

Thank you for your interest in contributing to ClawVault! This document provides guidelines for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Format](#commit-message-format)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Assume good intentions
- Help others learn and grow

## Development Setup

### Prerequisites

- Node.js 18+ or 20+
- npm or yarn
- Git
- TypeScript 5.2+

### Platform-Specific Requirements

**Linux:**
```bash
sudo apt-get install libsecret-tools
```

**macOS:**
No additional requirements (uses built-in keychain)

**Windows:**
No additional requirements (uses built-in Credential Manager)

### Fork and Clone

1. Fork the repository on GitHub
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/clawvault.git
   cd clawvault
   ```

### Install Dependencies

```bash
npm install
```

### Build the Project

```bash
npm run build
```

### Watch Mode for Development

```bash
npm run dev
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test Suite

```bash
# Unit tests
npm test test/unit/

# Integration tests
npm test test/integration/

# Security tests
npm test test/security/
```

### Run Single Test File

```bash
npx jest test/unit/storage/linux.test.ts
```

### Watch Tests

```bash
npm test -- --watch
```

### Coverage Report

```bash
npm test -- --coverage
```

Target coverage: 90%+

## Code Style Guidelines

### TypeScript

- Use strict TypeScript settings
- Avoid `any` types
- Use proper type annotations
- Prefer `interface` for object shapes
- Use JSDoc comments for exported functions

Example:
```typescript
/**
 * Store a secret in the keyring
 * @param name - Secret name (e.g., OPENAI_API_KEY)
 * @param value - Secret value (never logged)
 * @throws {StorageError} If keyring operation fails
 */
async set(name: string, value: string): Promise<void>
```

### Naming Conventions

- **Files**: `kebab-case.ts` (e.g., `linux-provider.ts`)
- **Classes**: `PascalCase` (e.g., `LinuxKeyringProvider`)
- **Functions/Variables**: `camelCase` (e.g., `createStorage`)
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `SECRET_NAME_PATTERN`)
- **Interfaces**: `PascalCase` with `I` prefix avoided (e.g., `StorageProvider`, not `IStorageProvider`)

### Import Order

```typescript
// 1. Node.js built-ins
import { promises as fs } from 'fs'
import { join } from 'path'

// 2. External dependencies
import express from 'express'
import chalk from 'chalk'

// 3. Internal modules (absolute paths preferred)
import { createStorage } from 'clawvault/storage'
import { loadConfig } from 'clawvault/config'

// 4. Relative imports
import { validateName } from './validation'
```

### Error Handling

Always use typed errors:

```typescript
export class StorageError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'StorageError'
  }
}
```

### Security Requirements

**CRITICAL**: ClawVault has specific security requirements that MUST be followed:

1. **Never log secret values**
   ```typescript
   // BAD
   console.log(`Storing value: ${value}`)

   // GOOD
   console.log(`Storing secret: ${name} (${value.length} bytes)`)
   ```

2. **Never return `get()` results from public APIs**
   ```typescript
   // BAD - exposes to AI context
   export function getSecret(name: string): string {
     return storage.get(name)
   }

   // GOOD - internal use only
   async function injectSecret(name: string): Promise<void> {
     const value = await storage.get(name)
     if (value) process.env[name] = value
   }
   ```

3. **Validate all inputs**
   ```typescript
   if (!name || typeof name !== 'string') {
     throw new ValidationError('Invalid name')
   }
   if (!SECRET_NAME_PATTERN.test(name)) {
     throw new ValidationError('Invalid name format')
   }
   ```

4. **Escape shell arguments**
   ```typescript
   private escapeValue(value: string): string {
     return value
       .replace(/\\/g, '\\\\')
       .replace(/"/g, '\\"')
   }
   ```

## Commit Message Format

Follow conventional commits:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Test additions/changes
- `chore`: Build process, tooling
- `security`: Security-related changes

### Examples

```
feat(storage): add Windows Credential Manager provider

Implement storage provider using cmdkey for Windows.
Includes fallback to PowerShell for password retrieval.

Closes #123

```

```
fix(cli): prevent secret value in error messages

Error messages were including secret values in some cases.
Now only metadata (name, length) is included.

Security: high
```

## Pull Request Process

### Before Submitting

1. Run tests: `npm test`
2. Check linting: `npm run lint`
3. Build project: `npm run build`
4. Run security audit: `grep -r "console.log.*value" src/`

### Creating a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes and commit

3. Push to your fork:
   ```bash
   git push origin feature/my-feature
   ```

4. Open a pull request on GitHub

### Pull Request Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Security tests pass
- [ ] Manual testing completed

## Security Considerations
- [ ] No secret values logged
- [ ] No secret values in error messages
- [ ] Inputs validated
- [ ] Shell arguments escaped

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] Commit messages follow format
```

### Review Process

1. Automated checks must pass (tests, linting)
2. At least one maintainer approval required
3. Security review required for storage/gateway changes
4. All comments must be addressed

## Reporting Bugs

### Before Reporting

- Check existing issues
- Verify it's not a platform-specific issue
- Check you're using the latest version

### Bug Report Template

```markdown
## Environment
- OS: [e.g., Ubuntu 22.04]
- Node.js version: [e.g., 20.0.0]
- ClawVault version: [e.g., 1.0.0]

## Description
Clear description of the bug

## Steps to Reproduce
1. Step one
2. Step two
3. ...

## Expected Behavior
What should happen

## Actual Behavior
What actually happens

## Logs
Relevant error messages or logs (remove secret values!)

## Additional Context
Screenshots, code examples, etc.
```

## Feature Requests

### Feature Request Template

```markdown
## Problem Description
What problem does this solve?

## Proposed Solution
How should it work?

## Alternatives Considered
Other approaches you considered

## Additional Context
Examples, use cases, etc.
```

## Development Resources

### Project Structure

```
clawvault/
├── src/
│   ├── storage/         # Keyring providers
│   ├── config/          # Configuration management
│   ├── gateway/         # Gateway integration
│   ├── web/             # Web UI
│   ├── cli/             # Command-line interface
│   └── types/           # TypeScript types
├── test/
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   └── security/        # Security tests
└── docs/                # Documentation
```

### Key Files

- `docs/agent/CLAUDE.md` - Project overview and agent guidance
- `docs/planning/DESIGN.md` - System design documentation
- `docs/planning/IMPLEMENTATION_PLAN.md` - Development roadmap
- `package.json` - Dependencies and scripts

### Getting Help

- GitHub Issues: Bug reports and feature requests
- GitHub Discussions: Questions and ideas
- Documentation: `docs/` folder

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
