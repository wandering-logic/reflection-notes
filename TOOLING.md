# Installing tooling for notebook-app (local dev)

This repo assumes a **local, per-user toolchain**:
- Node.js runtime (`node`)
- Node Version Manager (`nvm`) to pin a Node version per project
- Node Package Manager (`npm`) to install dependencies and run scripts
- `npx` to run project-local executables
- Dev tools installed *per repo* via `npm install` (Vite, TypeScript, Biome, etc.)
- Optional CLI AI assistants: OpenAI Codex (`codex`) and Claude Code (`claude`)

The goal is: **no global JS tooling required** beyond `node`/`npm` via `nvm`.

---

## Preconditions

On Ubuntu/Debian-like systems you typically need:

- `git`
- a compiler toolchain (some npm packages build native addons)
- `curl`

Example:
```sh
sudo apt-get update
sudo apt-get install -y git curl build-essential
```

## Install nvm (Node Version Manager)
Install nvm in your home directory and wire it into your shell.

Install:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/master/install.sh | bash
```

Ensure your shell init sources nvm (one of: `~/.bashrc`, `~/.zshrc`):

```sh
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

Restart your shell and verify:

```sh
command -v nvm
```

Notes:

`nvm` is a shell function, not a binary. `command -v nvm` should still find it if your init is correct.

## Install the project’s Node.js version
From the repo root:

```sh
cd THIS_DIRECTORY
nvm install
nvm use
node -v
npm -v
```

The versions for node and npm come from ./.nvmrc in this directory.

## Install project dependencies (includes dev tools)
From the repo root:

```sh
npm install
```

This uses `package.json` to install both runtime deps (`dependencies` section)
used by the app code and dev tooling (`devDependencies`) like Vite / TypeScript
/ Biome

All of these land in `node_modules/` and their executables land in `node_modules/.bin/`.

Sanity checks:

```sh
npx vite --version
npx tsc --version
npx biome --version
```

## Optional: Claude Code CLI (`claude`)

```sh
curl -fsSL https://claude.ai/install.sh | sh
```

This installs Claude Code in `~/.local/share`.  It may assume that `~/.local/bin`
is on your path.  If `~/.local/bin` is not on your path, you should move the
symlink `~/.local/bin/claude` to your `~/bin/` subdir.  It will probably be a
symlink to something like `~/.local/share/claude/versions/x.y.z`


## Optional: OpenAI Codex CLI (`codex`)

```sh
npm install -g @openai/codex
```

That will install codex in ~/.nvm/node/Vx.y.z/bin/codex.  The install of nvm
above should have modified your .bashrc to put that on your path.
