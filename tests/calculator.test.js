const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../calculator.js');

// ---------------------------------------------------------------------------
// bytesForQuant
// ---------------------------------------------------------------------------
test('bytesForQuant returns 2 for FP16', () => {
  assert.equal(C.bytesForQuant(16), 2);
});

test('bytesForQuant returns 1 for INT8', () => {
  assert.equal(C.bytesForQuant(8), 1);
});

test('bytesForQuant returns 0.5 for INT4', () => {
  assert.equal(C.bytesForQuant(4), 0.5);
});

test('bytesForQuant returns 0.4 for INT3 (with overhead)', () => {
  assert.equal(C.bytesForQuant(3), 0.4);
});

test('bytesForQuant returns 0.3 for INT2 (with overhead)', () => {
  assert.equal(C.bytesForQuant(2), 0.3);
});

// ---------------------------------------------------------------------------
// computeWeightsBytes
// ---------------------------------------------------------------------------
test('Llama 3 8B at Q4 needs ~4 GB of weights', () => {
  const bytes = C.computeWeightsBytes(8.03, 4);
  assert.ok(Math.abs(bytes - 8.03e9 * 0.5) < 1, `expected ~${8.03e9 * 0.5}, got ${bytes}`);
});

test('Llama 3 70B at Q4 needs ~35 GB of weights', () => {
  const bytes = C.computeWeightsBytes(70.6, 4);
  assert.ok(bytes > 35e9 && bytes < 36e9, `expected ~35 GB, got ${bytes}`);
});

test('weights scale linearly with parameter count', () => {
  const a = C.computeWeightsBytes(1, 4);
  const b = C.computeWeightsBytes(10, 4);
  assert.equal(b, a * 10);
});

test('FP16 weights are 4x larger than Q4 weights', () => {
  const fp16 = C.computeWeightsBytes(8, 16);
  const q4   = C.computeWeightsBytes(8, 4);
  assert.equal(fp16, q4 * 4);
});

// ---------------------------------------------------------------------------
// computeKvBytes
// ---------------------------------------------------------------------------
test('KV cache for Llama 3 8B @ 8k context is about 1 GB', () => {
  const bytes = C.computeKvBytes(32, 8, 128, 8192);
  // 2 * 32 * 8 * 128 * 8192 * 2 = 1,073,741,824
  assert.equal(bytes, 1073741824);
});

test('KV cache scales linearly with context length', () => {
  const small = C.computeKvBytes(32, 8, 128, 1024);
  const big   = C.computeKvBytes(32, 8, 128, 8192);
  assert.equal(big, small * 8);
});

// ---------------------------------------------------------------------------
// computeRawOps
// ---------------------------------------------------------------------------
test('raw ops = 2 × active params × tokens/sec', () => {
  // 8B params × 20 t/s = 2 × 8e9 × 20 = 3.2e11
  assert.equal(C.computeRawOps(8, 20), 3.2e11);
});

test('raw ops scales linearly with tokens/sec', () => {
  const a = C.computeRawOps(7, 10);
  const b = C.computeRawOps(7, 20);
  assert.equal(b, a * 2);
});

// ---------------------------------------------------------------------------
// computeBandwidthCeiling
// ---------------------------------------------------------------------------
test('bandwidth ceiling matches the M4 + Llama 3 8B Q4 reference', () => {
  // 120 GB/s × 0.7 = 84 GB/s effective. weights = 4.015 GB. ceiling = ~20.9 t/s.
  const weights = C.computeWeightsBytes(8.03, 4);
  const ceiling = C.computeBandwidthCeiling(120, weights);
  assert.ok(ceiling > 20 && ceiling < 22, `expected ~21 t/s, got ${ceiling}`);
});

test('bandwidth ceiling is null when bandwidth is missing', () => {
  assert.equal(C.computeBandwidthCeiling(null, 1e9), null);
  assert.equal(C.computeBandwidthCeiling(0, 1e9), null);
});

test('bandwidth ceiling is null when bytes streamed is zero', () => {
  assert.equal(C.computeBandwidthCeiling(120, 0), null);
});

test('bandwidth ceiling scales linearly with bandwidth', () => {
  const a = C.computeBandwidthCeiling(120, 4e9);
  const b = C.computeBandwidthCeiling(240, 4e9);
  assert.equal(b, a * 2);
});

// ---------------------------------------------------------------------------
// compute (integration)
// ---------------------------------------------------------------------------
const llama8b = C.MODELS.find((m) => m.name.startsWith('Llama 3.1 / 3 8B'));
const mixtral = C.MODELS.find((m) => m.name.startsWith('Mixtral'));
const m4      = C.HARDWARE.find((h) => h.name === 'Apple M1' /* dummy first lookup */);
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
  assert.ok(r.rawTops > 0.3 && r.rawTops < 0.35, `rawTops=${r.rawTops}`);
  // effective TOPS ~ 1.28
  assert.ok(r.effectiveTops > 1.2 && r.effectiveTops < 1.35, `effTops=${r.effectiveTops}`);
  // weights ~ 4 GB
  assert.ok(r.weightsBytes > 3.9e9 && r.weightsBytes < 4.1e9);
  // kv ~ 1 GB
  assert.ok(r.kvBytes > 1e9 && r.kvBytes < 1.2e9);
  // bandwidth ceiling ~ 21 t/s
  assert.ok(r.bandwidthCeiling > 20 && r.bandwidthCeiling < 22);
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
  assert.ok(r.weightsBytes > 23e9 && r.weightsBytes < 24e9, `weights=${r.weightsBytes}`);
  // compute uses active (12.9B): raw = 2 × 12.9e9 × 20 / 1e12 = 0.516 TOPS
  assert.ok(r.rawTops > 0.5 && r.rawTops < 0.53, `rawTops=${r.rawTops}`);
  // bandwidth ceiling uses active (12.9B Q4 = 6.45 GB streamed): 546*0.7/6.45 ≈ 59 t/s
  assert.ok(r.bandwidthCeiling > 55 && r.bandwidthCeiling < 65, `ceiling=${r.bandwidthCeiling}`);
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
  assert.equal(r.bandwidthCeiling, null);
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
  assert.equal(v, 'good');
});

test('classifyVerdict: warn when bandwidth is the bottleneck', () => {
  const v = C.classifyVerdict({
    effectiveTops: 1.5,
    bandwidthCeiling: 10,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  assert.equal(v, 'warn');
});

test('classifyVerdict: warn when compute is the bottleneck', () => {
  const v = C.classifyVerdict({
    effectiveTops: 50,
    bandwidthCeiling: 50,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  assert.equal(v, 'warn');
});

test('classifyVerdict: bad when neither is enough', () => {
  const v = C.classifyVerdict({
    effectiveTops: 50,
    bandwidthCeiling: 5,
    target: 20,
    hw: { tops: 38, bandwidth: 120 },
  });
  assert.equal(v, 'bad');
});

test('classifyVerdict: unknown when hardware is missing values', () => {
  const v = C.classifyVerdict({
    effectiveTops: 1,
    bandwidthCeiling: 20,
    target: 20,
    hw: { tops: null, bandwidth: null },
  });
  assert.equal(v, 'unknown');
});

// ---------------------------------------------------------------------------
// formatters
// ---------------------------------------------------------------------------
test('fmtGB switches to MB below 1 GB', () => {
  assert.equal(C.fmtGB(500e6), '500 MB');
});

test('fmtGB shows 2 decimals between 1 and 10 GB', () => {
  assert.equal(C.fmtGB(4.02e9), '4.02 GB');
});

test('fmtGB shows 1 decimal at 10 GB and above', () => {
  assert.equal(C.fmtGB(35.3e9), '35.3 GB');
});

test('fmtTops shows GOPS below 0.01 TOPS', () => {
  assert.equal(C.fmtTops(0.005), '5.00 GOPS');
});

test('fmtTops shows 2 decimals below 1 TOPS', () => {
  assert.equal(C.fmtTops(0.32), '0.32 TOPS');
});

test('fmtTops shows 1 decimal at 1 TOPS and above', () => {
  assert.equal(C.fmtTops(38), '38.0 TOPS');
});

test('fmtTps returns em dash for non-finite values', () => {
  assert.equal(C.fmtTps(Infinity), '—');
  assert.equal(C.fmtTps(NaN), '—');
  assert.equal(C.fmtTps(null), '—');
});

test('fmtTps shows 1 decimal below 10 tok/s', () => {
  assert.equal(C.fmtTps(5.4), '5.4 tok/s');
});

test('fmtTps rounds at 10 tok/s and above', () => {
  assert.equal(C.fmtTps(20.6), '21 tok/s');
});

// ---------------------------------------------------------------------------
// data sanity
// ---------------------------------------------------------------------------
test('every non-custom model has positive params and architecture fields', () => {
  for (const m of C.MODELS) {
    if (m.custom) continue;
    assert.ok(m.params > 0,   `${m.name} params`);
    assert.ok(m.active > 0,   `${m.name} active`);
    assert.ok(m.active <= m.params, `${m.name}: active should not exceed total`);
    assert.ok(m.layers > 0,   `${m.name} layers`);
    assert.ok(m.kvHeads > 0,  `${m.name} kvHeads`);
    assert.ok(m.headDim > 0,  `${m.name} headDim`);
  }
});

test('every non-custom hardware preset has positive TOPS and bandwidth', () => {
  for (const h of C.HARDWARE) {
    if (h.custom) continue;
    assert.ok(h.tops > 0,      `${h.name} tops`);
    assert.ok(h.bandwidth > 0, `${h.name} bandwidth`);
  }
});

test('M4 family is rated at 38 TOPS (the number the user asked about)', () => {
  for (const name of ['Apple M4', 'Apple M4 Pro', 'Apple M4 Max']) {
    const h = C.HARDWARE.find((x) => x.name === name);
    assert.equal(h.tops, 38, `${name} should be 38 TOPS`);
  }
});
