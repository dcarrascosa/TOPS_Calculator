# LLM TOPS Calculator

[![tests](https://github.com/dcarrascosa/tops_calculator/actions/workflows/tests.yml/badge.svg)](https://github.com/dcarrascosa/tops_calculator/actions/workflows/tests.yml)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

![HTML5](https://img.shields.io/badge/HTML5-E34F26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?logo=javascript&logoColor=black)
![Node.js](https://img.shields.io/badge/Node.js-5FA04E?logo=nodedotjs&logoColor=white)
![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white)

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

It's pure HTML + CSS + JS. No build step, no dependencies, no install.

1. Clone the repo.
2. Double-click `index.html`.

That's it. Or open it via any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Tests

Unit tests for the calculator math (no dependencies, uses Node's built-in test runner):

```bash
npm test
```

End-to-end tests with Playwright (drives a real browser against the live page):

```bash
npm install        # only the first time, installs @playwright/test
npx playwright install chromium   # only the first time, downloads the browser
npm run test:e2e
```

Run both in one go:

```bash
npm run test:all
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
