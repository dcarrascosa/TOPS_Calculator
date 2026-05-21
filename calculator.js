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
  const HARDWARE = [
    { name: 'Apple M1',         tops: 11,   bandwidth: 68.25 },
    { name: 'Apple M1 Pro',     tops: 11,   bandwidth: 200 },
    { name: 'Apple M1 Max',     tops: 11,   bandwidth: 400 },
    { name: 'Apple M1 Ultra',   tops: 22,   bandwidth: 800 },
    { name: 'Apple M2',         tops: 15.8, bandwidth: 100 },
    { name: 'Apple M2 Pro',     tops: 15.8, bandwidth: 200 },
    { name: 'Apple M2 Max',     tops: 15.8, bandwidth: 400 },
    { name: 'Apple M2 Ultra',   tops: 31.6, bandwidth: 800 },
    { name: 'Apple M3',         tops: 18,   bandwidth: 100 },
    { name: 'Apple M3 Pro',     tops: 18,   bandwidth: 150 },
    { name: 'Apple M3 Max',     tops: 18,   bandwidth: 400 },
    { name: 'Apple M4',         tops: 38,   bandwidth: 120 },
    { name: 'Apple M4 Pro',     tops: 38,   bandwidth: 273 },
    { name: 'Apple M4 Max',     tops: 38,   bandwidth: 546 },
    { name: 'Custom…',          custom: true },
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
