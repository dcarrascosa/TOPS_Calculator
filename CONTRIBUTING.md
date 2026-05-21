# Contributing

Thanks for wanting to help. This is a small project so the rules are short.

## Quick start

1. Fork the repo and create a branch from `main` for your change.
2. `bun install` (the project uses [Bun](https://bun.sh) as runtime, package manager and test runner).
3. Make your change.
4. `bun run test:all` should be green (37 unit + 12 e2e at the time of writing).
5. Sanity-check it in the browser (`bun run serve`).
6. Open a PR with a clear description of what changed and why.

## What's welcome

- **New models in the preset list.** Just add an entry to the model list in `app.js` with parameter count and (if applicable) active parameters for MoE. Cite a source in the PR.
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
