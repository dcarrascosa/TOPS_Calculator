# Contributing

Thanks for wanting to help. This is a small project so the rules are short.

## Quick start

1. Fork the repo and create a branch from `main` for your change. See [Branching strategy](#branching-strategy) below for naming.
2. `bun install` (the project uses [Bun](https://bun.sh) as runtime, package manager and test runner).
3. Make your change.
4. `bun run test:all` should be green (37 unit + 12 e2e at the time of writing).
5. Sanity-check it in the browser (`bun run serve`).
6. Open a PR with a clear description of what changed and why.

## Branching strategy

Trunk-based development with short-lived feature branches off `main`. No `develop`, no long-lived release branches.

### Branch naming

| Prefix | For |
|---|---|
| `feat/` | A new user-visible feature or capability |
| `fix/` | A bug fix |
| `chore/` | Maintenance, refactors, infra, dependencies, tooling |
| `docs/` | Documentation only (README, CONTRIBUTING, comments) |
| `test/` | Tests added or changed in isolation |

Examples from the project history: `feat/theme-toggle`, `chore/add-infographic`, `docs/wsl-render-images-note`, `fix/hidden-field-display`.

Keep the slug short and descriptive. Use hyphens, not underscores. Lowercase only.

### Branch protection on `main`

`main` is protected. Direct pushes are blocked. To land a change you **must**:

1. Open a PR with the [PR template](.github/pull_request_template.md) filled in.
2. Wait for the **unit tests** and **Playwright e2e** checks to pass.
3. Have at least 1 approving review (the repo owner can self-merge with `gh pr merge <num> --admin` since the maintainer count is one).
4. Resolve all review comment threads.
5. Squash-merge (linear history is enforced — no merge commits).
6. The branch is auto-deleted on merge.

Force-push and deletion of `main` are blocked for everyone, including admins.

### Merging

Always squash, never plain merge. From the CLI:

```bash
gh pr merge <num> --squash --delete-branch        # standard contributor flow
gh pr merge <num> --squash --delete-branch --admin   # owner self-merge bypass
```

## What's welcome

- **New models in the preset list.** Add an entry to the `MODELS` array in `calculator.js`. Required fields: `name`, `params` (total in billions, for memory), `active` (params per token, equal to total for dense models, smaller for MoE), `layers`, `kvHeads`, `headDim`. Cite the Hugging Face model card in the PR.
- **Better defaults / smarter heuristics.** If you have benchmarks showing the efficiency factor or bandwidth utilization should be different, share the data.
- **New hardware presets** (M4 Ultra, Snapdragon X, NVIDIA GPUs, AMD APUs…). The calculator is Mac-flavored today but the math is generic.
- **UX polish.** Layout, accessibility, dark mode tweaks.
- **Translations.** The UI is in English now; happy to accept ES / FR / DE / etc.
- **Bug reports.** Open an issue with what you typed, what you expected, what you got.

## What's not in scope (right now)

- Heavy frameworks. Keep it plain HTML / CSS / vanilla JS. No React, no build step.
- Server-side anything. This should run offline by double-clicking the file.
- Live benchmarking. The calculator estimates; it doesn't run models.

## Code style

- 2-space indent.
- `const` by default, `let` when you must, never `var`.
- Keep functions small and named after what they do.
- If you add a new constant (chip TOPS, model params), put a comment with the source/link.

## Regenerating images (OG / infographic)

`og-image.png` and `docs/infographic.png` are rendered from their `.svg` source via Playwright Chromium:

```bash
bun run build:images   # regenerates both
bun run build:og       # only og-image.png
bun run build:infographic   # only docs/infographic.png
```

> ⚠️ **Windows note:** Bun + Playwright + Windows currently times out launching the headless Chromium (Bun's `spawn` and Windows Defender's real-time scanning interfere with the IPC handshake). If you're on Windows, run these commands from inside **WSL** instead:
>
> ```bash
> # one-time setup in WSL Ubuntu
> curl -fsSL https://bun.sh/install | bash
> # clone / cd into the repo (in WSL or via /mnt/c/...)
> bun install
> bunx playwright install --with-deps chromium
> bun run build:images
> ```
>
> WSL is Linux, so there's no IPC issue. Native font fallback (`fonts-noto-color-emoji` is preinstalled on Ubuntu) renders the abacus emoji in the OG image cleanly.

After regenerating, commit both the `.svg` (source of truth) and the resulting `.png` (what gets served by Pages).

## Commit messages

- Present tense, lowercase, short.
- One thing per commit if you can.
- No need to namespace (`feat:`, `fix:` etc.) — keep it natural.

Examples:
- `add llama 3.3 70b preset`
- `fix kv cache math for grouped query attention`
- `tweak verdict copy when bandwidth is the bottleneck`

## Issues

If you're not sure whether something is in scope, just open an issue first and ask. Saves both of us time.

## License

By contributing you agree your contribution is licensed under the [MIT License](LICENSE).
