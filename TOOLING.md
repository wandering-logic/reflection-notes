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

nvm is a shell function, not a normal binary. command -v nvm should still find it if your init is correct.

2) Install the project’s Node.js version
From the repo root:

sh
￼Copy code
cd ~/work/jan-2026/notebook-app
nvm install
nvm use
node -v
npm -v
This expects the repo to provide a .nvmrc (or you can manage the version manually).

3) Install project dependencies (includes dev tools)
From the repo root:

sh
￼Copy code
npm install
This installs both:

runtime deps (dependencies) used by the app code

dev tooling (devDependencies) like Vite / TypeScript / Biome

All of these land in node_modules/ and their executables land in node_modules/.bin/.

Sanity checks:

sh
￼Copy code
npx vite --version
npx tsc --version
npx biome --version
4) Optional: Put ~/bin on PATH (recommended)
We keep user-level CLIs (like codex/claude) in ~/bin.

Add this to your shell init (~/.bashrc or ~/.zshrc):

sh
￼Copy code
case ":$PATH:" in
  *":$HOME/bin:"*) ;;
  *) export PATH="$HOME/bin:$PATH" ;;
esac
Verify:

sh
￼Copy code
echo "$PATH" | tr ':' '\n' | sed -n '1,10p'
5) Optional: Install / locate Codex CLI (codex)
Check whether it already exists:

sh
￼Copy code
command -v codex
codex --version
If it is not found, install using whatever method you originally used at work
(npm global, standalone installer, etc.). This repo does not require codex;
it is a convenience tool.

If you want it to be discoverable, ensure the codex binary lives in one of:

~/bin/

an nvm Node bin dir (if installed via npm -g)

/usr/local/bin (system-wide)

6) Optional: Install / locate Claude Code CLI (claude)
Check whether it exists:

sh
￼Copy code
command -v claude
claude --version
If the installer dropped it under ~/local/share/claude/versions/<VER>/,
prefer a symlink in ~/bin:

sh
￼Copy code
ln -sf ~/local/share/claude/versions/<VER> ~/bin/claude
hash -r 2>/dev/null || true
command -v claude
claude --version
Avoid relying on ~/.local/bin unless you intentionally add it to PATH.

7) What not to do
Do not install Vite/TypeScript/Biome globally. Use npm install + npm run … or npx ….

Do not assume ~/.local/bin is on PATH. This repo does not require it.

Do not “fix” missing tools by random global installs; it makes the environment non-reproducible.