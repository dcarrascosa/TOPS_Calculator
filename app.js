// LLM TOPS Calculator
// Estimates compute and memory requirements for local LLM inference.
//
// Math:
//   ops/token       = 2 × active_parameters (one multiply + one add per param)
//   required TOPS   = (ops/token × target_tps) / 1e12
//   effective TOPS  = required TOPS / efficiency       (real-world utilization)
//   weights memory  = total_params × bytes_per_param   (depends on quantization)
//   kv cache        = 2 × layers × kv_heads × head_dim × context × 2  (FP16 KV)
//   bandwidth ceil  = (bw_util × memory_bw) / weights_memory   (batch=1 tokens/sec)

// --- model presets ----------------------------------------------------------
// Sources: official model cards on Hugging Face (Meta, Mistral AI, Microsoft,
// Alibaba/Qwen, Google). Params are in billions. For MoE the "active" field
// is the activated experts per token.
const MODELS = [
  { name: 'Llama 3.2 1B',       params: 1.23, active: 1.23, layers: 16, kvHeads: 8,  headDim: 64  },
  { name: 'Llama 3.2 3B',       params: 3.21, active: 3.21, layers: 28, kvHeads: 8,  headDim: 128 },
  { name: 'Llama 3.1 / 3 8B',   params: 8.03, active: 8.03, layers: 32, kvHeads: 8,  headDim: 128 },
  { name: 'Llama 3.3 / 3.1 70B',params: 70.6, active: 70.6, layers: 80, kvHeads: 8,  headDim: 128 },
  { name: 'Mistral 7B',         params: 7.24, active: 7.24, layers: 32, kvHeads: 8,  headDim: 128 },
  { name: 'Mistral Nemo 12B',   params: 12.2, active: 12.2, layers: 40, kvHeads: 8,  headDim: 128 },
  { name: 'Mistral Small 22B',  params: 22.2, active: 22.2, layers: 56, kvHeads: 8,  headDim: 128 },
  { name: 'Mixtral 8x7B (MoE)', params: 46.7, active: 12.9, layers: 32, kvHeads: 8,  headDim: 128 },
  { name: 'Phi-3 mini 3.8B',    params: 3.82, active: 3.82, layers: 32, kvHeads: 32, headDim: 96  },
  { name: 'Phi-3 medium 14B',   params: 14.0, active: 14.0, layers: 40, kvHeads: 10, headDim: 128 },
  { name: 'Qwen 2.5 7B',        params: 7.62, active: 7.62, layers: 28, kvHeads: 4,  headDim: 128 },
  { name: 'Qwen 2.5 14B',       params: 14.8, active: 14.8, layers: 48, kvHeads: 8,  headDim: 128 },
  { name: 'Qwen 2.5 32B',       params: 32.8, active: 32.8, layers: 64, kvHeads: 8,  headDim: 128 },
  { name: 'Qwen 2.5 72B',       params: 72.7, active: 72.7, layers: 80, kvHeads: 8,  headDim: 128 },
  { name: 'Gemma 2 2B',         params: 2.61, active: 2.61, layers: 26, kvHeads: 4,  headDim: 256 },
  { name: 'Gemma 2 9B',         params: 9.24, active: 9.24, layers: 42, kvHeads: 8,  headDim: 256 },
  { name: 'Gemma 2 27B',        params: 27.2, active: 27.2, layers: 46, kvHeads: 16, headDim: 128 },
  { name: 'Custom…',            custom: true },
];

// --- hardware presets -------------------------------------------------------
// "tops" is the Apple Neural Engine INT8 figure as published.
// "bandwidth" is unified memory bandwidth in GB/s. For LLM inference on Mac,
// bandwidth is the real bottleneck — TOPS is shown for reference.
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

// --- DOM refs ---------------------------------------------------------------
const modelEl       = document.getElementById('model');
const customParamsEl= document.getElementById('customParams');
const customParamsField = document.getElementById('customParamsField');
const quantEl       = document.getElementById('quant');
const targetPresetEl= document.getElementById('targetPreset');
const customTargetEl= document.getElementById('customTarget');
const customTargetField = document.getElementById('customTargetField');
const contextEl     = document.getElementById('context');
const efficiencyEl  = document.getElementById('efficiency');
const hardwareEl    = document.getElementById('hardware');
const customTopsEl  = document.getElementById('customTops');
const customTopsField = document.getElementById('customHardwareField');
const customBwEl    = document.getElementById('customBandwidth');
const customBwField = document.getElementById('customBandwidthField');

const rawTopsEl     = document.getElementById('rawTops');
const effTopsEl     = document.getElementById('effectiveTops');
const weightsMemEl  = document.getElementById('weightsMem');
const kvMemEl       = document.getElementById('kvMem');
const totalMemEl    = document.getElementById('totalMem');
const bwCeilEl      = document.getElementById('bandwidthCeiling');
const verdictEl     = document.getElementById('verdict');

// --- populate selects -------------------------------------------------------
function populate() {
  MODELS.forEach((m, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = m.name;
    if (m.name.startsWith('Llama 3.1 / 3 8B')) opt.selected = true;
    modelEl.appendChild(opt);
  });

  HARDWARE.forEach((h, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = h.tops ? `${h.name}  ·  ${h.tops} TOPS  ·  ${h.bandwidth} GB/s` : h.name;
    if (h.name === 'Apple M4') opt.selected = true;
    hardwareEl.appendChild(opt);
  });
}

// --- helpers ----------------------------------------------------------------
function getModel() {
  const m = MODELS[+modelEl.value];
  if (!m.custom) return m;
  const p = Math.max(0.1, parseFloat(customParamsEl.value) || 0.1);
  return { name: 'Custom', params: p, active: p, layers: 32, kvHeads: 8, headDim: 128 };
}

function getHardware() {
  const h = HARDWARE[+hardwareEl.value];
  if (!h.custom) return h;
  return {
    name: 'Custom',
    tops: Math.max(0, parseFloat(customTopsEl.value) || 0),
    bandwidth: Math.max(0, parseFloat(customBwEl.value) || 0),
  };
}

function getTarget() {
  if (targetPresetEl.value === 'custom') {
    return Math.max(1, parseFloat(customTargetEl.value) || 1);
  }
  return parseFloat(targetPresetEl.value);
}

function bytesForQuant(bits) {
  // 3-bit and 2-bit have some overhead in real quant formats, approximate:
  if (bits === 3) return 0.4;
  if (bits === 2) return 0.3;
  return bits / 8;
}

function fmtGB(bytes) {
  const gb = bytes / 1e9;
  if (gb < 1) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${gb.toFixed(gb < 10 ? 2 : 1)} GB`;
}

function fmtTops(t) {
  if (t < 0.01) return `${(t * 1000).toFixed(2)} GOPS`;
  if (t < 1) return `${t.toFixed(2)} TOPS`;
  return `${t.toFixed(1)} TOPS`;
}

function fmtTps(x) {
  if (!isFinite(x)) return '—';
  if (x < 10) return `${x.toFixed(1)} tok/s`;
  return `${Math.round(x)} tok/s`;
}

// --- main computation -------------------------------------------------------
function compute() {
  const model     = getModel();
  const hw        = getHardware();
  const target    = getTarget();
  const quantBits = parseInt(quantEl.value, 10);
  const context   = parseInt(contextEl.value, 10);
  const eff       = parseFloat(efficiencyEl.value);

  const totalParams  = model.params * 1e9;
  const activeParams = model.active * 1e9;

  // compute
  const rawOps        = 2 * activeParams * target;
  const rawTops       = rawOps / 1e12;
  const effectiveTops = rawTops / eff;

  // memory
  const weightsBytes = totalParams * bytesForQuant(quantBits);
  const kvBytes      = 2 * model.layers * model.kvHeads * model.headDim * context * 2; // FP16 KV
  const overhead     = 1e9;
  const totalBytes   = weightsBytes + kvBytes + overhead;

  // bandwidth ceiling
  const bwUtilization  = 0.7;
  const bwBytesPerSec  = hw.bandwidth ? hw.bandwidth * 1e9 * bwUtilization : 0;
  // for MoE we only stream active experts per token
  const bytesStreamedPerToken = activeParams * bytesForQuant(quantBits);
  const bandwidthCeiling = bwBytesPerSec > 0
    ? bwBytesPerSec / bytesStreamedPerToken
    : null;

  // render numbers
  rawTopsEl.textContent    = fmtTops(rawTops);
  effTopsEl.textContent    = fmtTops(effectiveTops);
  weightsMemEl.textContent = fmtGB(weightsBytes);
  kvMemEl.textContent      = fmtGB(kvBytes);
  totalMemEl.textContent   = fmtGB(totalBytes);
  bwCeilEl.textContent     = bandwidthCeiling ? fmtTps(bandwidthCeiling) : '—';

  // verdict
  renderVerdict({
    model, hw, target, effectiveTops, bandwidthCeiling, totalBytes,
  });
}

function renderVerdict({ model, hw, target, effectiveTops, bandwidthCeiling, totalBytes }) {
  if (hw.tops == null || hw.bandwidth == null) {
    verdictEl.className = 'verdict';
    verdictEl.innerHTML = 'Enter custom TOPS and bandwidth to see a verdict.';
    return;
  }

  const enoughCompute   = effectiveTops <= hw.tops;
  const enoughBandwidth = bandwidthCeiling >= target;
  const memGB           = totalBytes / 1e9;

  let cls = 'good';
  let msg = '';

  if (enoughCompute && enoughBandwidth) {
    cls = 'good';
    msg = `<strong>${hw.name} can handle ${model.name} at ${target} tok/s.</strong> ` +
          `Required compute (${effectiveTops.toFixed(1)} TOPS) fits in ${hw.tops} TOPS, ` +
          `and the bandwidth ceiling is ~${Math.round(bandwidthCeiling)} tok/s. ` +
          `You'll need roughly ${memGB.toFixed(1)} GB of unified memory.`;
  } else if (!enoughBandwidth && enoughCompute) {
    cls = 'warn';
    msg = `<strong>Compute is fine, bandwidth is the limit.</strong> ` +
          `Your ${hw.name} (${hw.bandwidth} GB/s) caps out around ${Math.round(bandwidthCeiling)} tok/s on this model — ` +
          `below your ${target} tok/s target. Drop to a smaller / more quantized model, or pick a chip with more memory bandwidth (M4 Pro/Max).`;
  } else if (enoughBandwidth && !enoughCompute) {
    cls = 'warn';
    msg = `<strong>Bandwidth is fine, but compute is tight.</strong> ` +
          `${effectiveTops.toFixed(1)} effective TOPS needed vs ${hw.tops} available. ` +
          `This is unusual for LLMs on Mac — it usually means your efficiency setting is conservative. ` +
          `In practice, the bandwidth ceiling (~${Math.round(bandwidthCeiling)} tok/s) is what you'll observe.`;
  } else {
    cls = 'bad';
    msg = `<strong>Likely not enough.</strong> ` +
          `Both compute (need ${effectiveTops.toFixed(1)} TOPS, have ${hw.tops}) and bandwidth ` +
          `(~${Math.round(bandwidthCeiling)} tok/s ceiling vs ${target} target) fall short. ` +
          `Try heavier quantization (4-bit → 3-bit), a smaller model, or a chip with more bandwidth.`;
  }

  // memory warning
  if (memGB > 64) {
    msg += ` <em>Heads up: needs ${memGB.toFixed(0)} GB unified memory — only top-spec M-series configs ship with that much.</em>`;
  } else if (memGB > 32) {
    msg += ` <em>Needs ${memGB.toFixed(0)} GB unified memory — pick a 36 GB+ config.</em>`;
  }

  verdictEl.className = 'verdict ' + cls;
  verdictEl.innerHTML = msg;
}

// --- wiring -----------------------------------------------------------------
function toggleCustomFields() {
  customParamsField.hidden    = !MODELS[+modelEl.value].custom;
  customTargetField.hidden    = targetPresetEl.value !== 'custom';
  const hwCustom = HARDWARE[+hardwareEl.value].custom;
  customTopsField.hidden      = !hwCustom;
  customBwField.hidden        = !hwCustom;
}

function init() {
  populate();
  toggleCustomFields();
  compute();

  const inputs = [
    modelEl, customParamsEl, quantEl, targetPresetEl, customTargetEl,
    contextEl, efficiencyEl, hardwareEl, customTopsEl, customBwEl,
  ];
  inputs.forEach((el) => {
    el.addEventListener('input', () => {
      toggleCustomFields();
      compute();
    });
    el.addEventListener('change', () => {
      toggleCustomFields();
      compute();
    });
  });
}

init();
