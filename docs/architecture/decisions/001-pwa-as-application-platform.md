# 001 - PWA as Application Platform

**Status:** Accepted

## Context

This project is a semantic notebook editor for personal note-taking, intended to replace OneNote and earlier Emacs/Markdown workflows.

The primary developer and user is on Linux, but the app also needs to be usable from a phone. Key requirements:

- **Rich text editing** with images and tables (Markdown in Emacs lacked these)
- **Open format** to avoid lock-in (OneNote's proprietary format is a pain point)
- **Offline support** for use on planes or with poor connectivity
- **Cross-device access** without complex setup
- **Blog export** capability for generating static site content

The reality of Linux desktop development is that native GUI apps often have poor UX compared to web-based alternatives. The developer already relies on PWAs and web apps for WYSIWYG work (Google Sheets, OneNote PWA, CircuitLab).

## Options Considered

### Native Linux App (GTK/Qt)

Rejected. Linux native apps have a tradition of rough UX. More critically, there's no path to phone access without building and maintaining a separate mobile app.

### Electron

Viable, and remains a fallback option for platforms where PWA support is weak (notably macOS). However, Electron apps are heavy (~150MB baseline) and require native build/distribution infrastructure. Overkill for the primary use case.

### Tauri

Not evaluated at decision time. Tauri uses native OS webviews instead of bundling Chromium, resulting in smaller apps (~5-10MB). Worth considering for future native distribution if needed.

### Pure Web App (no offline)

Rejected. Offline and poor-connectivity scenarios matter for note-taking.

### Progressive Web App

Chosen. See Decision below.

## Decision

Build the application as a Progressive Web App (PWA).

**Rationale:**

1. **Single codebase** runs anywhere there's a modern browser. No platform-specific builds required for the primary use case.

2. **Linux development workflow** is natural - just a browser and standard web tooling.

3. **Phone access** works through the browser without app store gatekeeping or review processes.

4. **Offline support** via service workers provides the disconnected-use capability that a pure web app lacks.

5. **Known escape hatch** - if PWA limitations become blocking on specific platforms (e.g., macOS), the web codebase can be wrapped in Electron with moderate effort. The architecture doesn't preclude this.

6. **Familiar model** - the developer already uses PWAs daily and understands their capabilities and limitations.

## Consequences

### Web API Limitations

The application is constrained by what browser APIs expose:

- **File System Access API** is Chromium-only (Chrome, Edge). Firefox and Safari do not implement it and have stated they won't. This means local file access only works fully in Chromium browsers.
- **Clipboard API** only supports `text/plain`, `text/html`, and `image/png`. No JPEG, GIF, or other formats. Images must be converted to PNG for clipboard operations.
- **No native file associations** - users cannot double-click a notebook file to open the app.
- Each missing or limited API is a potential future workaround or feature gap.

### Browser as Runtime

Users need Chrome or Edge for full functionality. Firefox and Safari users will get a degraded experience or certain features won't work at all. This is an acceptable tradeoff for a personal tool, but limits broader adoption.

### Mobile is the Weakest Platform

- iOS Safari actively limits PWA capabilities (service worker restrictions, no Add to Home Screen prompting, Apple policy hostility toward PWAs)
- Chrome on Android lacks File System Access API
- The phone story depends on cloud sync (Dropbox backend, future work) rather than local file access

### Service Worker Complexity

Service worker caching enables offline use but adds update complexity. Cache invalidation bugs can strand users on old versions. Requires careful cache versioning strategy.

### Electron Remains an Option

If PWA limitations prove too constraining on specific platforms, wrapping in Electron is possible but not free - it requires replacing File System Access API with Node's `fs`, handling IPC, and maintaining additional build infrastructure.
