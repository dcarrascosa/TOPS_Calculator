const { test, expect } = require('bun:test');
const C = require('../calculator.js');

// ---------------------------------------------------------------------------
// bytesForQuant
// ---------------------------------------------------------------------------
test('bytesForQuant returns 2 for FP16', () => {
  expect(C.bytesForQuant(16)).toBe(2);
});

test('bytesForQuant returns 1 for INT8', () => {
  expect(C.bytesForQuant(8)).toBe(1);
});

test('bytesForQuant returns 0.5 for INT4', () => {
  expect(C.bytesForQuant(4)).toBe(0.5);
});

test('bytesForQuant returns 0.4 for INT3 (with overhead)', () => {
  expect(C.bytesForQuant(3)).toBe(0.4);
});

test('bytesForQuant returns 0.3 for INT2 (with overhead)', () => {
  expect(C.bytesForQuant(2)).toBe(0.3);
});

// ---------------------------------------------------------------------------
// computeWeightsBytes
// ---------------------------------------------------------------------------
test('Llama 3 8B at Q4 needs ~4 GB of weights', () => {
  const bytes = C.computeWeightsBytes(8.03, 4);
  expect(Math.abs(bytes - 8.03e9 * 0.5)).toBeLessThan(1);
});

test('Llama 3 70B at Q4 needs ~35 GB of weights', () => {
  const bytes = C.computeWeightsBytes(70.6, 4);
  expect(bytes).toBeGreaterThan(35e9);
  expect(bytes).toBeLessThan(36e9);
});

test('weights scale linearly with parameter count', () => {
  const a = C.computeWeightsBytes(1, 4);
  const b = C.computeWeightsBytes(10, 4);
  expect(b).toBe(a * 10);
});

test('FP16 weights are 4x larger than Q4 weights', () => {
  const fp16 = C.computeWeightsBytes(8, 16);
  const q4   = C.computeWeightsBytes(8, 4);
  expect(fp16).toBe(q4 * 4);
});

// ---------------------------------------------------------------------------
// computeKvBytes
// ---------------------------------------------------------------------------
test('KV cache for Llama 3 8B @ 8k context is about 1 GB', () => {
  const bytes = C.computeKvBytes(32, 8, 128, 8192);
  // 2 * 32 * 8 * 128 * 8192 * 2 = 1,073,741,824
  expect(bytes).toBe(1073741824);
});

test('KV cache scales linearly with context length', () => {
  const small = C.computeKvBytes(32, 8, 128, 1024);
  const big   = C.computeKvBytes(32, 8, 128, 8192);
  expect(big).toBe(small * 8);
});

// ---------------------------------------------------------------------------
// computeRawOps
// ---------------------------------------------------------------------------
test('raw ops = 2 × active params × tokens/sec', () => {
  // 8B params × 20 t/s = 2 × 8e9 × 20 = 3.2e11
  expect(C.computeRawOps(8, 20)).toBe(3.2e11);
});

test('raw ops scales linearly with tokens/sec', () => {
  const a = C.computeRawOps(7, 10);
  const b = C.computeRawOps(7, 20);
  expect(b).toBe(a * 2);
});

// ---------------------------------------------------------------------------
// computeBandwidthCeiling
// ---------------------------------------------------------------------------
test('bandwidth ceiling matches the M4 + Llama 3 8B Q4 reference', () => {
  // 120 GB/s × 0.7 = 84 GB/s effective. weights = 4.015 GB. ceiling = ~20.9 t/s.
  const weights = C.computeWeightsBytes(8.03, 4);
  const ceiling = C.computeBandwidthCeiling(120, weights);
  expect(ceiling).toBeGreaterThan(20);
  expect(ceiling).toBeLessThan(22);
});

test('bandwidth ceiling is null when bandwidth is missing', () => {
  expect(C.computeBandwidthCeiling(null, 1e9)).toBeNull();
  expect(C.computeBandwidthCeiling(0, 1e9)).toBeNull();
});

test('bandwidth ceiling is null when bytes streamed is zero', () => {
  expect(C.computeBandwidthCeiling(120, 0)).toBeNull();
});

test('bandwidth ceiling scales linearly with bandwidth', () => {
  const a = C.computeBandwidthCeiling(120, 4e9);
  const b = C.computeBandwidthCeiling(240, 4e9);
  expect(b).toBe(a * 2);
});

// ---------------------------------------------------------------------------
// compute (integration)
// ---------------------------------------------------------------------------
const llama8b = C.MODELS.find((m) => m.name.startsWith('Llama 3.1 / 3 8B'));
const mixtral = C.MODELS.find((m) => m.name.startsWith('Mixtral'));
const m4real  = C.HARDWARE.find((h) => h.name === 'Apple M4');
const m4Max   = C.HARDWARE.find((h) => h.name === 'Apple M4 Max');

test('full compute: Llama 3 8B Q4 @ 20 t/s on M4 matches reference', () => {
  const r = C.compute({
    model: llama8b,
    hw: m4real,
    target: 20,
    quantBits: 4,
    context: 8192,
    efficiency: 0.25,
  });

  // raw TOPS ~ 0.321
  expect(r.rawTops).toBeGreaterThan(0.3);
  expect(r.rawTops).toBeLessThan(0.35);
  // effective TOPS ~ 1.28
  expect(r.effectiveTops).toBeGreaterThan(1.2);
  expect(r.effectiveTops).toBeLessThan(1.35);
  // weights ~ 4 GB
  expect(r.weightsBytes).toBeGreaterThan(3.9e9);
  expect(r.weightsBytes).toBeLessThan(4.1e9);
  // kv ~ 1 GB
  expect(r.kvBytes).toBeGreaterThan(1e9);
  expect(r.kvBytes).toBeLessThan(1.2e9);
  // bandwidth ceiling ~ 21 t/s
  expect(r.bandwidthCeiling).toBeGreaterThan(20);
  expect(r.bandwidthCeiling).toBeLessThan(22);
});

test('full compute: MoE uses active params for compute and bandwidth, total for memory', () => {
  const r = C.compute({
    model: mixtral,
    hw: m4Max,
    target: 20,
    quantBits: 4,
    context: 8192,
    efficiency: 0.25,
  });

  // memory uses total (46.7B), so weights ~ 23.35 GB
  expect(r.weightsBytes).toBeGreaterThan(23e9);
  expect(r.weightsBytes).toBeLessThan(24e9);
  // compute uses active (12.9B): raw = 2 × 12.9e9 × 20 / 1e12 = 0.516 TOPS
  expect(r.rawTops).toBeGreaterThan(0.5);
  expect(r.rawTops).toBeLessThan(0.53);
  // bandwidth ceiling uses active (12.9B Q4 = 6.45 GB streamed): 546*0.7/6.45 ≈ 59 t/s
  expect(r.bandwidthCeiling).toBeGreaterThan(55);
  expect(r.bandwidthCeiling).toBeLessThan(65);
});

test('compute returns null bandwidth ceiling when hardware has none', () => {
  const r = C.compute({
    model: llama8b,
    hw: { tops: null, bandwidth: null },
    target: 20,
    quantBits: 4,
    context: 8192,
    efficiency: 0.25,
  });
  expect(r.bandwidthCeiling).toBeNull();
});

// ---------------------------------------------------------------------------
// classifyVerdict
// ---------------------------------------------------------------------------
test('classifyVerdict: good when both compute and bandwidth suffice', () => {
  const v = C.classifyVerdict({
    effectiveTops: 1.5,
    bandwidthCeiling: 25,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  expect(v).toBe('good');
});

test('classifyVerdict: warn when bandwidth is the bottleneck', () => {
  const v = C.classifyVerdict({
    effectiveTops: 1.5,
    bandwidthCeiling: 10,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  expect(v).toBe('warn');
});

test('classifyVerdict: warn when compute is the bottleneck', () => {
  const v = C.classifyVerdict({
    effectiveTops: 50,
    bandwidthCeiling: 50,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  expect(v).toBe('warn');
});

test('classifyVerdict: bad when neither is enough', () => {
  const v = C.classifyVerdict({
    effectiveTops: 50,
    bandwidthCeiling: 5,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  expect(v).toBe('bad');
});

test('classifyVerdict: unknown when hardware is missing values', () => {
  const v = C.classifyVerdict({
    effectiveTops: 1,
    bandwidthCeiling: 20,
    target: 20,
    hw: { tops: null, bandwidth: null },
  });
  expect(v).toBe('unknown');
});

// ---------------------------------------------------------------------------
// formatters
// ---------------------------------------------------------------------------
test('fmtGB switches to MB below 1 GB', () => {
  expect(C.fmtGB(500e6)).toBe('500 MB');
});

test('fmtGB shows 2 decimals between 1 and 10 GB', () => {
  expect(C.fmtGB(4.02e9)).toBe('4.02 GB');
});

test('fmtGB shows 1 decimal at 10 GB and above', () => {
  expect(C.fmtGB(35.3e9)).toBe('35.3 GB');
});

test('fmtTops shows GOPS below 0.01 TOPS', () => {
  expect(C.fmtTops(0.005)).toBe('5.00 GOPS');
});

test('fmtTops shows 2 decimals below 1 TOPS', () => {
  expect(C.fmtTops(0.32)).toBe('0.32 TOPS');
});

test('fmtTops shows 1 decimal at 1 TOPS and above', () => {
  expect(C.fmtTops(38)).toBe('38.0 TOPS');
});

test('fmtTps returns em dash for non-finite values', () => {
  expect(C.fmtTps(Infinity)).toBe('—');
  expect(C.fmtTps(NaN)).toBe('—');
  expect(C.fmtTps(null)).toBe('—');
});

test('fmtTps shows 1 decimal below 10 tok/s', () => {
  expect(C.fmtTps(5.4)).toBe('5.4 tok/s');
});

test('fmtTps rounds at 10 tok/s and above', () => {
  expect(C.fmtTps(20.6)).toBe('21 tok/s');
});

// ---------------------------------------------------------------------------
// data sanity
// ---------------------------------------------------------------------------
test('every non-custom model has positive params and architecture fields', () => {
  for (const m of C.MODELS) {
    if (m.custom) continue;
    expect(m.params).toBeGreaterThan(0);
    expect(m.active).toBeGreaterThan(0);
    expect(m.active).toBeLessThanOrEqual(m.params);
    expect(m.layers).toBeGreaterThan(0);
    expect(m.kvHeads).toBeGreaterThan(0);
    expect(m.headDim).toBeGreaterThan(0);
  }
});

test('every non-custom hardware preset has positive TOPS and bandwidth', () => {
  for (const h of C.HARDWARE) {
    if (h.custom) continue;
    expect(h.tops).toBeGreaterThan(0);
    expect(h.bandwidth).toBeGreaterThan(0);
  }
});

test('M4 family is rated at 38 TOPS (the number the user asked about)', () => {
  for (const name of ['Apple M4', 'Apple M4 Pro', 'Apple M4 Max']) {
    const h = C.HARDWARE.find((x) => x.name === name);
    expect(h.tops).toBe(38);
  }
});

test('every MoE model has active params strictly less than total', () => {
  const moe = C.MODELS.filter((m) => !m.custom && /\(MoE\)/.test(m.name));
  expect(moe.length).toBeGreaterThan(0);
  for (const m of moe) {
    expect(m.active).toBeLessThan(m.params);
  }
});

test('preset list includes flagship 2024-2025 models', () => {
  const names = C.MODELS.map((m) => m.name);
  expect(names.some((n) => n.startsWith('Llama 4 Scout'))).toBe(true);
  expect(names.some((n) => n.startsWith('Llama 4 Maverick'))).toBe(true);
  expect(names.some((n) => n.startsWith('DeepSeek V3'))).toBe(true);
  expect(names.some((n) => n.startsWith('Phi-4'))).toBe(true);
  expect(names.some((n) => n.startsWith('Qwen 3'))).toBe(true);
  expect(names.some((n) => n.startsWith('Gemma 3'))).toBe(true);
});

test('hardware presets cover Apple, NVIDIA, AMD and Copilot+ PC NPUs', () => {
  const groups = new Set(C.HARDWARE.filter((h) => h.group).map((h) => h.group));
  expect(groups.has('Apple Silicon')).toBe(true);
  expect(groups.has('NVIDIA GeForce')).toBe(true);
  expect(groups.has('NVIDIA Datacenter')).toBe(true);
  expect(groups.has('AMD Radeon')).toBe(true);
  expect(groups.has('Copilot+ PC NPUs')).toBe(true);
});

test('flagship NVIDIA datacenter cards have huge bandwidth (sanity check)', () => {
  const a100 = C.HARDWARE.find((h) => h.name.startsWith('NVIDIA A100'));
  const h100 = C.HARDWARE.find((h) => h.name.startsWith('NVIDIA H100'));
  expect(a100.bandwidth).toBeGreaterThan(1500);
  expect(h100.bandwidth).toBeGreaterThan(2500);
});

// ---------------------------------------------------------------------------
// URL state
// ---------------------------------------------------------------------------
test('encodeStateToUrl includes only non-null fields', () => {
  const qs = C.encodeStateToUrl({
    modelName: 'Llama 3.1 / 3 8B',
    customParams: null,
    quantBits: 4,
    target: 20,
    context: 8192,
    efficiency: 0.25,
    hardwareName: 'Apple M4',
    customTops: null,
    customBandwidth: null,
  });
  const p = new URLSearchParams(qs);
  expect(p.get('m')).toBe('Llama 3.1 / 3 8B');
  expect(p.get('q')).toBe('4');
  expect(p.get('t')).toBe('20');
  expect(p.get('c')).toBe('8192');
  expect(p.get('e')).toBe('0.25');
  expect(p.get('h')).toBe('Apple M4');
  expect(p.has('mp')).toBe(false);
  expect(p.has('ht')).toBe(false);
  expect(p.has('hb')).toBe(false);
});

test('encodeStateToUrl includes custom fields when set', () => {
  const qs = C.encodeStateToUrl({
    modelName: 'Custom',
    customParams: 13,
    quantBits: 8,
    target: 120,
    context: 32768,
    efficiency: 0.4,
    hardwareName: 'Custom',
    customTops: 50,
    customBandwidth: 256,
  });
  const p = new URLSearchParams(qs);
  expect(p.get('mp')).toBe('13');
  expect(p.get('ht')).toBe('50');
  expect(p.get('hb')).toBe('256');
});

test('decodeStateFromUrl parses every field as the right type', () => {
  const s = C.decodeStateFromUrl(
    '?m=Apple%20M4&mp=13&q=4&t=20&c=8192&e=0.25&h=Apple%20M4&ht=50&hb=256'
  );
  expect(s.modelName).toBe('Apple M4');
  expect(s.customParams).toBe(13);
  expect(s.quantBits).toBe(4);
  expect(s.target).toBe(20);
  expect(s.context).toBe(8192);
  expect(s.efficiency).toBe(0.25);
  expect(s.hardwareName).toBe('Apple M4');
  expect(s.customTops).toBe(50);
  expect(s.customBandwidth).toBe(256);
});

test('decodeStateFromUrl returns nulls for missing fields', () => {
  const s = C.decodeStateFromUrl('');
  expect(s.modelName).toBeNull();
  expect(s.customParams).toBeNull();
  expect(s.quantBits).toBeNull();
});

test('encode then decode round-trips a full state', () => {
  const original = {
    modelName: 'Llama 3.1 / 3 8B',
    customParams: null,
    quantBits: 4,
    target: 30,
    context: 16384,
    efficiency: 0.4,
    hardwareName: 'Apple M4 Max',
    customTops: null,
    customBandwidth: null,
  };
  const qs = C.encodeStateToUrl(original);
  const decoded = C.decodeStateFromUrl('?' + qs);
  expect(decoded.modelName).toBe(original.modelName);
  expect(decoded.quantBits).toBe(original.quantBits);
  expect(decoded.target).toBe(original.target);
  expect(decoded.context).toBe(original.context);
  expect(decoded.efficiency).toBe(original.efficiency);
  expect(decoded.hardwareName).toBe(original.hardwareName);
});
