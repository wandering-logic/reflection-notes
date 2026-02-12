# 001: Build as a Progressive Web App

## Status

Accepted

## Context

We need to build a semantic notebook editor with rich text editing, math support, and file management. The application must work across multiple platforms and devices while providing a native-like experience.

Options considered:

1. **Progressive Web App (PWA)** - A web application with offline support, installability, and access to modern browser APIs like File System Access.

2. **Native desktop app (Electron)** - Cross-platform desktop application using web technologies wrapped in a native shell.

3. **Native mobile apps** - Separate iOS and Android implementations using platform-specific frameworks.

4. **Desktop-only native app** - A platform-specific native application (e.g., macOS-only using Swift).

## Decision

Build the application as a Progressive Web App.

Key factors:

- **Cross-platform reach**: A PWA runs on any device with a modern browser - desktop, tablet, and mobile - without maintaining separate codebases.

- **Simpler deployment**: Updates deploy instantly via the web. No app store review process, no waiting for users to update, no platform-specific build pipelines.

- **Better user experience for this use case**: The File System Access API allows direct access to local files (on supported browsers), enabling users to store notes in their own directories. PWA installability provides an app-like experience without the Electron overhead.

- **Modern API availability**: Service workers enable offline support. Web APIs continue to expand (e.g., File System Access, Web Share), narrowing the gap with native apps.

## Consequences

### What's easier

- Single codebase serves all platforms
- Instant deployments and updates
- No app store fees or approval delays
- Users can try the app immediately without installation
- Standard web development tooling (Vite, TypeScript, npm)
- Smaller bundle size compared to Electron

### What's harder

- Some APIs are browser-specific (File System Access API not available in Firefox/Safari)
- Less control over window management and system integration
- Must design graceful fallbacks for unsupported features
- PWA installation is less discoverable than app stores
- No access to certain native capabilities (e.g., system-level keyboard shortcuts, tray icons)
