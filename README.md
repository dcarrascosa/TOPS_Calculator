# LLM TOPS Calculator

[![tests](https://github.com/dcarrascosa/TOPS_Calculator/actions/workflows/tests.yml/badge.svg)](https://github.com/dcarrascosa/TOPS_Calculator/actions/workflows/tests.yml)
[![live demo](https://img.shields.io/badge/demo-live-2EAD33?logo=github)](https://dcarrascosa.github.io/TOPS_Calculator/)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white)

> **Try it live:** https://dcarrascosa.github.io/TOPS_Calculator/ — no install needed, auto-deployed from `main` on every merge.

Interactive calculator that estimates how many **TOPS** (Tera Operations Per Second) you need to run local language models — Llama 3, Mistral, Qwen, Gemma, Phi… — at different quantization levels (FP16, 8-bit, 4-bit, 3-bit, 2-bit) and target speeds.

Built specifically to answer the question: **are 38–50 TOPS enough for professional use on a Mac?** (spoiler: the answer depends more on memory bandwidth than on TOPS, and the calculator explains why).

## What it does

- Pick a model (or define a custom one by parameter count).
- Pick a quantization (FP16 / Q8 / Q4 / Q3 / Q2).
- Pick a target tokens/second (reading speed, conversational, real-time…).
- Get:
  - Required raw TOPS to hit that speed.
  - Required effective TOPS once you account for typical real-world efficiency.
  - Memory needed to hold the weights + KV cache.
  - A verdict comparing it against your chip (M1 / M2 / M3 / M4 / M4 Pro / M4 Max, or a custom value).
  - A reminder that on Apple Silicon, LLM inference is usually **memory-bandwidth-bound**, not compute-bound, so it also estimates the bandwidth ceiling for tokens/sec.

## How to run it

Easiest: open the [live demo](https://dcarrascosa.github.io/TOPS_Calculator/). Nothing to install.

To run it locally — it's pure HTML + CSS + JS. No build step. Just open it.

1. Clone the repo.
2. Double-click `index.html`.

Or run the bundled dev server (cross-platform):

```bash
bun install   # only the first time
bun run serve
# then open http://localhost:8000
```

> Need [Bun](https://bun.sh) installed. The project uses Bun as its runtime, package manager and test runner. `npm` is not supported.

## Tests

Unit tests for the calculator math (`bun:test`):

```bash
bun test
```

End-to-end tests with Playwright (drives a real browser against the live page):

```bash
bun install                              # only the first time
bunx playwright install chromium         # only the first time, downloads the browser
bun run test:e2e
```

Run both in one go:

```bash
bun run test:all
```

## The math (short version)

For each generated token, an LLM does roughly `2 × N` operations, where `N` is the parameter count. So:

```
Required TOPS = (2 × parameters × tokens_per_second) / 10^12
```

That's the theoretical floor. Real hardware rarely hits more than 20–40% of its peak TOPS for LLM inference, so the calculator multiplies by an efficiency factor (configurable) to give a realistic number.

It also computes the memory-bandwidth ceiling:

```
Max tokens/sec ≈ memory_bandwidth / model_size_in_memory
```

For batch=1 inference (the common case on a laptop), this is almost always the real bottleneck.

## Caveats

- These are **estimates**, not benchmarks. Actual performance depends on the framework (llama.cpp, MLX, Ollama, vLLM…), the kernel implementations, thermals, and a dozen other things.
- Apple's published TOPS numbers refer to the **Neural Engine**, but most LLM runtimes use the **GPU** (via Metal/MLX). The calculator lets you switch between those.
- MoE models (Mixtral, etc.) are tricky — the calculator uses *active* parameters per token, not total.

## License

[MIT](LICENSE). Use it however you like.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). PRs welcome.

## Author

Ideated, designed and implemented by **David Carrascosa Bolaños**.

Built with the support of AI-assisted coding tools.
