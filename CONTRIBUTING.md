# Contributing to Agentokratia

Thank you for your interest in contributing to Agentokratia! This document provides guidelines and instructions for contributing.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone.

## How to Contribute

### Reporting Bugs

Before submitting a bug report:

1. Check existing issues to avoid duplicates
2. Use the bug report template when creating a new issue
3. Include steps to reproduce, expected behavior, and actual behavior
4. Add screenshots if applicable

### Suggesting Features

1. Check existing issues and discussions first
2. Use the feature request template
3. Clearly describe the use case and proposed solution

### Pull Requests

1. Fork the repository
2. Create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes following our coding standards
4. Write or update tests if applicable
5. Run linting and type checking:
   ```bash
   npm run lint
   npm run type-check
   ```
6. Commit with clear, descriptive messages
7. Push and open a pull request

### Commit Messages

Use clear, descriptive commit messages:

- `feat: add user profile page`
- `fix: resolve wallet connection issue on mobile`
- `docs: update README with new setup instructions`
- `refactor: simplify authentication flow`

### Coding Standards

- Use TypeScript for all new code
- Follow existing code style and patterns
- Use meaningful variable and function names
- Keep components small and focused
- Add comments for complex logic

### Development Setup

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local` and configure
4. Start development server: `npm run dev`

### Testing

- Test your changes locally before submitting
- Ensure the build passes: `npm run build`
- Verify type checking: `npm run type-check`

## Questions?

Open a discussion or reach out to the maintainers.
