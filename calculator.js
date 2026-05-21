// Pure calculation logic for the LLM TOPS Calculator.
// Exposed as `window.Calculator` in the browser and `module.exports` in Node,
// so it can be unit-tested without a DOM.

(function (root) {
  // --- model presets --------------------------------------------------------
  // Architecture fields (layers, kvHeads, headDim) sourced from each model's
  // official Hugging Face card. Best-effort, not guaranteed exact — the
  // calculator math is tolerant to small architecture variations.
  const MODELS = [
    { name: 'Llama 3.2 1B',           params: 1.23, active: 1.23, layers: 16, kvHeads: 8,   headDim: 64  },
    { name: 'Llama 3.2 3B',           params: 3.21, active: 3.21, layers: 28, kvHeads: 8,   headDim: 128 },
    { name: 'Llama 3.1 / 3 8B',       params: 8.03, active: 8.03, layers: 32, kvHeads: 8,   headDim: 128 },
    { name: 'Llama 3.3 / 3.1 70B',    params: 70.6, active: 70.6, layers: 80, kvHeads: 8,   headDim: 128 },
    { name: 'Llama 4 Scout 17B-16E (MoE)',    params: 109,  active: 17,   layers: 64, kvHeads: 8,   headDim: 128 },
    { name: 'Llama 4 Maverick 17B-128E (MoE)',params: 400,  active: 17,   layers: 64, kvHeads: 8,   headDim: 128 },
    { name: 'Mistral 7B',             params: 7.24, active: 7.24, layers: 32, kvHeads: 8,   headDim: 128 },
    { name: 'Mistral Nemo 12B',       params: 12.2, active: 12.2, layers: 40, kvHeads: 8,   headDim: 128 },
    { name: 'Mistral Small 22B',      params: 22.2, active: 22.2, layers: 56, kvHeads: 8,   headDim: 128 },
    { name: 'Mixtral 8x7B (MoE)',     params: 46.7, active: 12.9, layers: 32, kvHeads: 8,   headDim: 128 },
    { name: 'Mixtral 8x22B (MoE)',    params: 141,  active: 39,   layers: 56, kvHeads: 8,   headDim: 128 },
    { name: 'DeepSeek V3 (MoE)',      params: 671,  active: 37,   layers: 61, kvHeads: 128, headDim: 128 },
    { name: 'Phi-3 mini 3.8B',        params: 3.82, active: 3.82, layers: 32, kvHeads: 32,  headDim: 96  },
    { name: 'Phi-3 medium 14B',       params: 14.0, active: 14.0, layers: 40, kvHeads: 10,  headDim: 128 },
    { name: 'Phi-4 14B',              params: 14.7, active: 14.7, layers: 40, kvHeads: 10,  headDim: 128 },
    { name: 'Qwen 2.5 7B',            params: 7.62, active: 7.62, layers: 28, kvHeads: 4,   headDim: 128 },
    { name: 'Qwen 2.5 14B',           params: 14.8, active: 14.8, layers: 48, kvHeads: 8,   headDim: 128 },
    { name: 'Qwen 2.5 32B',           params: 32.8, active: 32.8, layers: 64, kvHeads: 8,   headDim: 128 },
    { name: 'Qwen 2.5 72B',           params: 72.7, active: 72.7, layers: 80, kvHeads: 8,   headDim: 128 },
    { name: 'Qwen 3 8B',              params: 8.2,  active: 8.2,  layers: 36, kvHeads: 8,   headDim: 128 },
    { name: 'Qwen 3 14B',             params: 14.8, active: 14.8, layers: 40, kvHeads: 8,   headDim: 128 },
    { name: 'Qwen 3 32B',             params: 32.8, active: 32.8, layers: 64, kvHeads: 8,   headDim: 128 },
    { name: 'Qwen 3 235B-A22B (MoE)', params: 235,  active: 22,   layers: 94, kvHeads: 8,   headDim: 128 },
    { name: 'Gemma 2 2B',             params: 2.61, active: 2.61, layers: 26, kvHeads: 4,   headDim: 256 },
    { name: 'Gemma 2 9B',             params: 9.24, active: 9.24, layers: 42, kvHeads: 8,   headDim: 256 },
    { name: 'Gemma 2 27B',            params: 27.2, active: 27.2, layers: 46, kvHeads: 16,  headDim: 128 },
    { name: 'Gemma 3 4B',             params: 4.3,  active: 4.3,  layers: 34, kvHeads: 4,   headDim: 256 },
    { name: 'Gemma 3 12B',            params: 12.2, active: 12.2, layers: 48, kvHeads: 8,   headDim: 256 },
    { name: 'Gemma 3 27B',            params: 27.4, active: 27.4, layers: 62, kvHeads: 16,  headDim: 128 },
    { name: 'Custom…',                custom: true },
  ];

  // --- hardware presets -----------------------------------------------------
  // TOPS values are INT8 published peak (dense, no sparsity gains) where
  // available. Bandwidth is unified memory or VRAM peak. The `group` field
  // drives the <optgroup> in the dropdown.
  const HARDWARE = [
    { group: 'Apple Silicon',     name: 'Apple M1',                       tops: 11,   bandwidth: 68.25 },
    { group: 'Apple Silicon',     name: 'Apple M1 Pro',                   tops: 11,   bandwidth: 200  },
    { group: 'Apple Silicon',     name: 'Apple M1 Max',                   tops: 11,   bandwidth: 400  },
    { group: 'Apple Silicon',     name: 'Apple M1 Ultra',                 tops: 22,   bandwidth: 800  },
    { group: 'Apple Silicon',     name: 'Apple M2',                       tops: 15.8, bandwidth: 100  },
    { group: 'Apple Silicon',     name: 'Apple M2 Pro',                   tops: 15.8, bandwidth: 200  },
    { group: 'Apple Silicon',     name: 'Apple M2 Max',                   tops: 15.8, bandwidth: 400  },
    { group: 'Apple Silicon',     name: 'Apple M2 Ultra',                 tops: 31.6, bandwidth: 800  },
    { group: 'Apple Silicon',     name: 'Apple M3',                       tops: 18,   bandwidth: 100  },
    { group: 'Apple Silicon',     name: 'Apple M3 Pro',                   tops: 18,   bandwidth: 150  },
    { group: 'Apple Silicon',     name: 'Apple M3 Max',                   tops: 18,   bandwidth: 400  },
    { group: 'Apple Silicon',     name: 'Apple M4',                       tops: 38,   bandwidth: 120  },
    { group: 'Apple Silicon',     name: 'Apple M4 Pro',                   tops: 38,   bandwidth: 273  },
    { group: 'Apple Silicon',     name: 'Apple M4 Max',                   tops: 38,   bandwidth: 546  },

    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 3060 12GB',           tops: 52,   bandwidth: 360  },
    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 3090 24GB',           tops: 142,  bandwidth: 936  },
    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 4060 8GB',            tops: 121,  bandwidth: 272  },
    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 4070 12GB',           tops: 233,  bandwidth: 504  },
    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 4080 16GB',           tops: 390,  bandwidth: 717  },
    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 4090 24GB',           tops: 660,  bandwidth: 1008 },
    { group: 'NVIDIA GeForce',    name: 'NVIDIA RTX 5090 32GB',           tops: 1676, bandwidth: 1792 },

    { group: 'NVIDIA Datacenter', name: 'NVIDIA A100 80GB',               tops: 624,  bandwidth: 2039 },
    { group: 'NVIDIA Datacenter', name: 'NVIDIA H100 80GB',               tops: 1979, bandwidth: 3350 },

    { group: 'AMD Radeon',        name: 'AMD Radeon RX 7900 XT 20GB',     tops: 103,  bandwidth: 800  },
    { group: 'AMD Radeon',        name: 'AMD Radeon RX 7900 XTX 24GB',    tops: 123,  bandwidth: 960  },

    { group: 'Copilot+ PC NPUs',  name: 'Qualcomm Snapdragon X Elite',    tops: 45,   bandwidth: 135  },
    { group: 'Copilot+ PC NPUs',  name: 'Intel Core Ultra 200V (Lunar)',  tops: 48,   bandwidth: 136  },
    { group: 'Copilot+ PC NPUs',  name: 'AMD Ryzen AI 9 HX 370 (Strix)',  tops: 50,   bandwidth: 136  },
    { group: 'Copilot+ PC NPUs',  name: 'AMD Ryzen AI Max+ 395 (Halo)',   tops: 50,   bandwidth: 256  },

    { name: 'Custom…',            custom: true },
  ];

  const BW_UTILIZATION = 0.7;     // realistic fraction of peak bandwidth used
  const KV_BYTES_PER_PARAM = 2;   // KV cache stays FP16 in most runtimes
  const OVERHEAD_BYTES = 1e9;     // ~1 GB runtime overhead

  // --- pure math ------------------------------------------------------------
  function bytesForQuant(bits) {
    if (bits === 3) return 0.4;
    if (bits === 2) return 0.3;
    return bits / 8;
  }

  function computeWeightsBytes(paramsBillions, quantBits) {
    return paramsBillions * 1e9 * bytesForQuant(quantBits);
  }

  function computeKvBytes(layers, kvHeads, headDim, context) {
    return 2 * layers * kvHeads * headDim * context * KV_BYTES_PER_PARAM;
  }

  function computeRawOps(activeParamsBillions, tokensPerSec) {
    return 2 * activeParamsBillions * 1e9 * tokensPerSec;
  }

  function computeBandwidthCeiling(bandwidthGBs, bytesStreamedPerToken) {
    if (!bandwidthGBs || bandwidthGBs <= 0) return null;
    if (!bytesStreamedPerToken || bytesStreamedPerToken <= 0) return null;
    return (bandwidthGBs * 1e9 * BW_UTILIZATION) / bytesStreamedPerToken;
  }

  function compute({ model, hw, target, quantBits, context, efficiency }) {
    const totalParams  = model.params;
    const activeParams = model.active;

    const rawOps        = computeRawOps(activeParams, target);
    const rawTops       = rawOps / 1e12;
    const effectiveTops = rawTops / efficiency;

    const weightsBytes = computeWeightsBytes(totalParams, quantBits);
    const kvBytes      = computeKvBytes(model.layers, model.kvHeads, model.headDim, context);
    const totalBytes   = weightsBytes + kvBytes + OVERHEAD_BYTES;

    const bytesStreamedPerToken = computeWeightsBytes(activeParams, quantBits);
    const bandwidthCeiling = hw && hw.bandwidth != null
      ? computeBandwidthCeiling(hw.bandwidth, bytesStreamedPerToken)
      : null;

    return {
      rawTops,
      effectiveTops,
      weightsBytes,
      kvBytes,
      totalBytes,
      bandwidthCeiling,
    };
  }

  function classifyVerdict({ effectiveTops, bandwidthCeiling, target, hw }) {
    if (!hw || hw.tops == null || hw.bandwidth == null) return 'unknown';
    const enoughCompute   = effectiveTops <= hw.tops;
    const enoughBandwidth = bandwidthCeiling != null && bandwidthCeiling >= target;
    if (enoughCompute && enoughBandwidth) return 'good';
    if (!enoughCompute && !enoughBandwidth) return 'bad';
    return 'warn';
  }

  // --- URL state ------------------------------------------------------------
  // Serialize the current UI inputs as a querystring and back, so a config
  // can be shared as a link. Names (not indices) are used for `m` and `h` to
  // stay stable across preset list reorderings.
  function encodeStateToUrl(state) {
    const p = new URLSearchParams();
    if (state.modelName) p.set('m', state.modelName);
    if (state.customParams != null) p.set('mp', String(state.customParams));
    if (state.quantBits != null) p.set('q', String(state.quantBits));
    if (state.target != null) p.set('t', String(state.target));
    if (state.context != null) p.set('c', String(state.context));
    if (state.efficiency != null) p.set('e', String(state.efficiency));
    if (state.hardwareName) p.set('h', state.hardwareName);
    if (state.customTops != null) p.set('ht', String(state.customTops));
    if (state.customBandwidth != null) p.set('hb', String(state.customBandwidth));
    return p.toString();
  }

  function decodeStateFromUrl(search) {
    const p = new URLSearchParams(search || '');
    const num = (v) => (v == null || v === '' ? null : Number(v));
    return {
      modelName:       p.get('m'),
      customParams:    num(p.get('mp')),
      quantBits:       num(p.get('q')),
      target:          num(p.get('t')),
      context:         num(p.get('c')),
      efficiency:      num(p.get('e')),
      hardwareName:    p.get('h'),
      customTops:      num(p.get('ht')),
      customBandwidth: num(p.get('hb')),
    };
  }

  // --- comparison chart -----------------------------------------------------
  const CHART_MODEL_NAMES = [
    'Llama 3.2 1B',
    'Llama 3.2 3B',
    'Llama 3.1 / 3 8B',
    'Mistral 7B',
    'Mixtral 8x7B (MoE)',
    'Llama 3.3 / 3.1 70B',
  ];

  function buildComparison({ hw, quantBits, target }) {
    if (!hw || !hw.bandwidth) return [];
    return CHART_MODEL_NAMES
      .map((name) => MODELS.find((m) => m.name === name))
      .filter(Boolean)
      .map((m) => {
        const bytes = computeWeightsBytes(m.active, quantBits);
        const ceiling = computeBandwidthCeiling(hw.bandwidth, bytes);
        let verdict = 'bad';
        if (ceiling >= target) verdict = 'good';
        else if (ceiling >= target * 0.5) verdict = 'warn';
        return { name: m.name, ceiling, verdict };
      });
  }

  // --- markdown export ------------------------------------------------------
  function buildMarkdownReport({ model, hw, target, quantBits, context, efficiency }, result) {
    const quantLabel = quantBits === 16 ? 'FP16' : `${quantBits}-bit`;
    const contextLabel = context >= 1024 ? `${Math.round(context / 1024)}k` : String(context);
    const effLabel = `${Math.round(efficiency * 100)}%`;
    const ceilingLabel = result.bandwidthCeiling != null ? fmtTps(result.bandwidthCeiling) : 'n/a';
    const hwLabel = hw.tops != null && hw.bandwidth != null
      ? `${hw.name} (${hw.tops} TOPS, ${hw.bandwidth} GB/s)`
      : hw.name;

    return [
      `**LLM TOPS Calculator** — ${model.name} on ${hwLabel}`,
      '',
      '| Setting | Value |',
      '|---|---|',
      `| Quantization | ${quantLabel} |`,
      `| Target tokens/sec | ${target} |`,
      `| Context | ${contextLabel} |`,
      `| Real-world efficiency | ${effLabel} |`,
      '',
      '| Result | Value |',
      '|---|---|',
      `| Required raw TOPS | ${fmtTops(result.rawTops)} |`,
      `| Required effective TOPS | ${fmtTops(result.effectiveTops)} |`,
      `| Weights memory | ${fmtGB(result.weightsBytes)} |`,
      `| KV cache memory | ${fmtGB(result.kvBytes)} |`,
      `| Total memory | ${fmtGB(result.totalBytes)} |`,
      `| Bandwidth ceiling (batch=1) | ${ceilingLabel} |`,
      '',
    ].join('\n');
  }

  // --- i18n -----------------------------------------------------------------
  const TRANSLATIONS = {
    en: {
      'title':                'LLM TOPS Calculator',
      'tagline':              'How many TOPS does it really take to run a local LLM on your Mac?',
      'inputs.title':         'Inputs',
      'inputs.model':         'Model',
      'inputs.customParams':  'Custom parameters (billions)',
      'inputs.quant':         'Quantization',
      'inputs.target':        'Target tokens / second',
      'inputs.customTarget':  'Custom tokens/sec',
      'inputs.context':       'Context length (tokens)',
      'inputs.efficiency':    'Real-world efficiency',
      'inputs.hardware':      'Your hardware',
      'inputs.customTops':    'Custom TOPS (INT8)',
      'inputs.customBw':      'Custom memory bandwidth (GB/s)',
      'target.reading':       '5 — reading speed',
      'target.conv':          '10 — conversational',
      'target.fast':          '20 — fast chat',
      'target.realtime':      '30 — real-time',
      'target.agentic':       '60 — agentic / coding',
      'target.custom':        'Custom…',
      'eff.tuned':            '40% — well-optimized (MLX, llama.cpp tuned)',
      'eff.typical':          '25% — typical',
      'eff.cold':             '15% — cold path / generic kernels',
      'results.title':        'Results',
      'results.rawTops':      'Required raw TOPS',
      'results.rawTopsHelp':  'Theoretical floor: 2 × params × tokens/sec.',
      'results.effTops':      'Required effective TOPS',
      'results.effTopsHelp':  'Raw ÷ efficiency. What you actually need on the spec sheet.',
      'results.weights':      'Weights memory',
      'results.weightsHelp':  'RAM needed just to hold the model.',
      'results.kv':           'KV cache memory',
      'results.kvHelp':       'Grows with context length.',
      'results.total':        'Total memory',
      'results.totalHelp':    'Weights + KV cache + ~1 GB overhead.',
      'results.bw':           'Bandwidth ceiling',
      'results.bwHelp':       'Max tokens/sec your RAM bandwidth allows (batch=1).',
      'verdict.default':      'Pick a model and a target to see the verdict.',
      'verdict.unknown':      'Enter custom TOPS and bandwidth to see a verdict.',
      'verdict.good':         '<strong>{hw} can handle {model} at {target} tok/s.</strong> Required compute ({effTops} TOPS) fits in {hwTops} TOPS, and the bandwidth ceiling is ~{ceiling} tok/s. You\'ll need roughly {memGB} GB of unified memory.',
      'verdict.warnBw':       '<strong>Compute is fine, bandwidth is the limit.</strong> Your {hw} ({hwBw} GB/s) caps out around {ceiling} tok/s on this model — below your {target} tok/s target. Drop to a smaller / more quantized model, or pick a chip with more memory bandwidth.',
      'verdict.warnCompute':  '<strong>Bandwidth is fine, but compute is tight.</strong> {effTops} effective TOPS needed vs {hwTops} available. In practice, the bandwidth ceiling (~{ceiling} tok/s) is what you\'ll observe.',
      'verdict.bad':          '<strong>Likely not enough.</strong> Both compute (need {effTops} TOPS, have {hwTops}) and bandwidth (~{ceiling} tok/s ceiling vs {target} target) fall short. Try heavier quantization (4-bit → 3-bit), a smaller model, or a chip with more bandwidth.',
      'verdict.memBig':       ' <em>Heads up: needs {memGB} GB of unified memory — only top-spec configs ship with that much.</em>',
      'verdict.memMed':       ' <em>Needs {memGB} GB unified memory — pick a 36 GB+ config.</em>',
      'explainer.title':      'Why TOPS isn\'t the whole story on a Mac',
      'explainer.p1':         'Apple advertises Neural Engine TOPS (38 on M4, for example), but most local LLM runtimes — <strong>llama.cpp</strong>, <strong>Ollama</strong>, <strong>MLX</strong>, <strong>LM Studio</strong> — run on the <strong>GPU</strong>, not the Neural Engine. For batch=1 inference (one user, one prompt), the bottleneck is almost always <strong>memory bandwidth</strong>, not compute.',
      'explainer.p2':         'Rule of thumb: you can\'t generate tokens faster than your RAM can stream the model\'s weights through the chip. A 4 GB quantized model on a chip with 120 GB/s bandwidth caps out around 30 tokens/sec — no matter how many TOPS the spec sheet says.',
      'explainer.p3':         'That\'s why this calculator shows both numbers. If you\'re trying to decide whether 38–50 TOPS is enough for professional use, the honest answer is: <strong>yes, comfortably — but check the bandwidth ceiling for the model you actually want to run.</strong>',
      'foot.source':          'Source on GitHub',
      'foot.note':            'MIT licensed · estimates only, not benchmarks.',
      'actions.share':        'Copy share link',
      'actions.copyMd':       'Copy as markdown',
      'actions.downloadMd':   'Download .md',
      'feedback.linkCopied':  'Link copied',
      'feedback.linkFailed':  'Copy failed — select the address bar',
      'feedback.mdCopied':    'Markdown copied',
      'feedback.mdFailed':    'Copy failed',
      'feedback.downloaded':  'Downloaded',
      'chart.title':          'What fits your hardware',
      'chart.help':           'Tokens/sec ceiling (bandwidth-bound, batch=1) for a curated set of models on your selected hardware at the chosen quantization. Bars are coloured against your tokens/sec target.',
      'chart.pickHw':         'Select a hardware preset to see the comparison.',
    },
    es: {
      'title':                'Calculadora de TOPS para LLMs',
      'tagline':              '¿Cuántos TOPS hacen falta de verdad para ejecutar un LLM local en tu Mac?',
      'inputs.title':         'Entradas',
      'inputs.model':         'Modelo',
      'inputs.customParams':  'Parámetros personalizados (miles de millones)',
      'inputs.quant':         'Cuantización',
      'inputs.target':        'Tokens / segundo objetivo',
      'inputs.customTarget':  'Tokens/s personalizado',
      'inputs.context':       'Longitud de contexto (tokens)',
      'inputs.efficiency':    'Eficiencia del mundo real',
      'inputs.hardware':      'Tu hardware',
      'inputs.customTops':    'TOPS personalizados (INT8)',
      'inputs.customBw':      'Ancho de banda de memoria personalizado (GB/s)',
      'target.reading':       '5 — velocidad de lectura',
      'target.conv':          '10 — conversacional',
      'target.fast':          '20 — chat rápido',
      'target.realtime':      '30 — tiempo real',
      'target.agentic':       '60 — agentes / código',
      'target.custom':        'Personalizado…',
      'eff.tuned':            '40% — bien optimizado (MLX, llama.cpp ajustado)',
      'eff.typical':          '25% — típico',
      'eff.cold':             '15% — sin optimizar / kernels genéricos',
      'results.title':        'Resultados',
      'results.rawTops':      'TOPS brutos requeridos',
      'results.rawTopsHelp':  'Mínimo teórico: 2 × parámetros × tokens/s.',
      'results.effTops':      'TOPS efectivos requeridos',
      'results.effTopsHelp':  'Brutos ÷ eficiencia. Lo que necesitas en la hoja de especificaciones.',
      'results.weights':      'Memoria de pesos',
      'results.weightsHelp':  'RAM necesaria solo para mantener el modelo.',
      'results.kv':           'Memoria de KV cache',
      'results.kvHelp':       'Crece con la longitud de contexto.',
      'results.total':        'Memoria total',
      'results.totalHelp':    'Pesos + KV cache + ~1 GB de overhead.',
      'results.bw':           'Techo por ancho de banda',
      'results.bwHelp':       'Máximo de tokens/s que permite tu RAM (batch=1).',
      'verdict.default':      'Elige un modelo y un objetivo para ver el veredicto.',
      'verdict.unknown':      'Introduce TOPS y ancho de banda personalizados para ver el veredicto.',
      'verdict.good':         '<strong>{hw} puede con {model} a {target} tok/s.</strong> El compute requerido ({effTops} TOPS) cabe en {hwTops} TOPS, y el techo por ancho de banda es ~{ceiling} tok/s. Necesitarás unos {memGB} GB de memoria unificada.',
      'verdict.warnBw':       '<strong>El compute sobra, el ancho de banda es el límite.</strong> Tu {hw} ({hwBw} GB/s) topa en ~{ceiling} tok/s con este modelo — por debajo de tu objetivo de {target} tok/s. Baja a un modelo más pequeño / más cuantizado, o elige un chip con más ancho de banda.',
      'verdict.warnCompute':  '<strong>El ancho de banda sobra, pero el compute va justo.</strong> Necesitas {effTops} TOPS efectivos frente a los {hwTops} disponibles. En la práctica, el techo por ancho de banda (~{ceiling} tok/s) es lo que vas a observar.',
      'verdict.bad':          '<strong>Probablemente no llega.</strong> Ni el compute (necesitas {effTops} TOPS, tienes {hwTops}) ni el ancho de banda (~{ceiling} tok/s frente al objetivo de {target}) son suficientes. Prueba cuantización más agresiva (4-bit → 3-bit), un modelo más pequeño, o un chip con más ancho de banda.',
      'verdict.memBig':       ' <em>Aviso: necesita {memGB} GB de memoria unificada — solo las configuraciones top de gama llegan.</em>',
      'verdict.memMed':       ' <em>Necesita {memGB} GB de memoria unificada — elige una configuración de 36 GB+.</em>',
      'explainer.title':      'Por qué las TOPS no son toda la historia en un Mac',
      'explainer.p1':         'Apple anuncia las TOPS del Neural Engine (38 en M4, por ejemplo), pero la mayoría de runtimes locales de LLM — <strong>llama.cpp</strong>, <strong>Ollama</strong>, <strong>MLX</strong>, <strong>LM Studio</strong> — corren en la <strong>GPU</strong>, no en el Neural Engine. Para inferencia batch=1 (un usuario, un prompt), el cuello de botella casi siempre es el <strong>ancho de banda de memoria</strong>, no el compute.',
      'explainer.p2':         'Regla del pulgar: no puedes generar tokens más rápido de lo que tu RAM puede transferir los pesos del modelo. Un modelo cuantizado de 4 GB en un chip con 120 GB/s topa en torno a 30 tokens/s — sin importar cuántas TOPS diga la hoja de especificaciones.',
      'explainer.p3':         'Por eso esta calculadora muestra ambos números. Si estás decidiendo si 38–50 TOPS son suficientes para uso profesional, la respuesta honesta es: <strong>sí, de sobra — pero comprueba el techo por ancho de banda para el modelo que realmente quieres ejecutar.</strong>',
      'foot.source':          'Código fuente en GitHub',
      'foot.note':            'Licencia MIT · solo estimaciones, no benchmarks.',
      'actions.share':        'Copiar enlace para compartir',
      'actions.copyMd':       'Copiar como markdown',
      'actions.downloadMd':   'Descargar .md',
      'feedback.linkCopied':  'Enlace copiado',
      'feedback.linkFailed':  'No se pudo copiar — selecciona la barra de direcciones',
      'feedback.mdCopied':    'Markdown copiado',
      'feedback.mdFailed':    'No se pudo copiar',
      'feedback.downloaded':  'Descargado',
      'chart.title':          'Qué cabe en tu hardware',
      'chart.help':           'Techo de tokens/s (limitado por ancho de banda, batch=1) para un conjunto de modelos representativos en el hardware seleccionado con la cuantización elegida. Las barras se colorean contra tu objetivo de tokens/s.',
      'chart.pickHw':         'Elige un preset de hardware para ver la comparación.',
    },
  };

  function t(key, lang, vars) {
    const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
    let s = dict[key] != null ? dict[key] : (TRANSLATIONS.en[key] != null ? TRANSLATIONS.en[key] : key);
    if (vars) {
      for (const k of Object.keys(vars)) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      }
    }
    return s;
  }

  // --- formatters -----------------------------------------------------------
  function fmtGB(bytes) {
    const gb = bytes / 1e9;
    if (gb < 1) return (bytes / 1e6).toFixed(0) + ' MB';
    return gb.toFixed(gb < 10 ? 2 : 1) + ' GB';
  }

  function fmtTops(t) {
    if (t < 0.01) return (t * 1000).toFixed(2) + ' GOPS';
    if (t < 1) return t.toFixed(2) + ' TOPS';
    return t.toFixed(1) + ' TOPS';
  }

  function fmtTps(x) {
    if (!isFinite(x) || x == null) return '—';
    if (x < 10) return x.toFixed(1) + ' tok/s';
    return Math.round(x) + ' tok/s';
  }

  // --- export ---------------------------------------------------------------
  const api = {
    MODELS,
    HARDWARE,
    BW_UTILIZATION,
    KV_BYTES_PER_PARAM,
    OVERHEAD_BYTES,
    bytesForQuant,
    computeWeightsBytes,
    computeKvBytes,
    computeRawOps,
    computeBandwidthCeiling,
    compute,
    classifyVerdict,
    encodeStateToUrl,
    decodeStateFromUrl,
    buildComparison,
    CHART_MODEL_NAMES,
    buildMarkdownReport,
    TRANSLATIONS,
    t,
    fmtGB,
    fmtTops,
    fmtTps,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Calculator = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
