// DOM wiring for the LLM TOPS Calculator.
// Pure calculation logic lives in calculator.js (window.Calculator).

(function () {
  const C = window.Calculator;
  const { MODELS, HARDWARE, compute, classifyVerdict, fmtGB, fmtTops, fmtTps } = C;

  // --- DOM refs -------------------------------------------------------------
  const modelEl           = document.getElementById('model');
  const customParamsEl    = document.getElementById('customParams');
  const customParamsField = document.getElementById('customParamsField');
  const quantEl           = document.getElementById('quant');
  const targetPresetEl    = document.getElementById('targetPreset');
  const customTargetEl    = document.getElementById('customTarget');
  const customTargetField = document.getElementById('customTargetField');
  const contextEl         = document.getElementById('context');
  const efficiencyEl      = document.getElementById('efficiency');
  const hardwareEl        = document.getElementById('hardware');
  const customTopsEl      = document.getElementById('customTops');
  const customTopsField   = document.getElementById('customHardwareField');
  const customBwEl        = document.getElementById('customBandwidth');
  const customBwField     = document.getElementById('customBandwidthField');

  const rawTopsEl    = document.getElementById('rawTops');
  const effTopsEl    = document.getElementById('effectiveTops');
  const weightsMemEl = document.getElementById('weightsMem');
  const kvMemEl      = document.getElementById('kvMem');
  const totalMemEl   = document.getElementById('totalMem');
  const bwCeilEl     = document.getElementById('bandwidthCeiling');
  const verdictEl    = document.getElementById('verdict');

  // --- populate selects -----------------------------------------------------
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
      opt.textContent = h.tops
        ? `${h.name}  ·  ${h.tops} TOPS  ·  ${h.bandwidth} GB/s`
        : h.name;
      if (h.name === 'Apple M4') opt.selected = true;
      hardwareEl.appendChild(opt);
    });
  }

  // --- input readers --------------------------------------------------------
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

  // --- render ---------------------------------------------------------------
  function render() {
    const model     = getModel();
    const hw        = getHardware();
    const target    = getTarget();
    const quantBits = parseInt(quantEl.value, 10);
    const context   = parseInt(contextEl.value, 10);
    const efficiency = parseFloat(efficiencyEl.value);

    const r = compute({ model, hw, target, quantBits, context, efficiency });

    rawTopsEl.textContent    = fmtTops(r.rawTops);
    effTopsEl.textContent    = fmtTops(r.effectiveTops);
    weightsMemEl.textContent = fmtGB(r.weightsBytes);
    kvMemEl.textContent      = fmtGB(r.kvBytes);
    totalMemEl.textContent   = fmtGB(r.totalBytes);
    bwCeilEl.textContent     = r.bandwidthCeiling != null ? fmtTps(r.bandwidthCeiling) : '—';

    renderVerdict({
      model, hw, target,
      effectiveTops: r.effectiveTops,
      bandwidthCeiling: r.bandwidthCeiling,
      totalBytes: r.totalBytes,
    });
  }

  function renderVerdict({ model, hw, target, effectiveTops, bandwidthCeiling, totalBytes }) {
    const cls = classifyVerdict({ effectiveTops, bandwidthCeiling, target, hw });
    const memGB = totalBytes / 1e9;
    let msg = '';

    if (cls === 'unknown') {
      verdictEl.className = 'verdict';
      verdictEl.innerHTML = 'Enter custom TOPS and bandwidth to see a verdict.';
      return;
    }

    if (cls === 'good') {
      msg = `<strong>${hw.name} can handle ${model.name} at ${target} tok/s.</strong> ` +
            `Required compute (${effectiveTops.toFixed(1)} TOPS) fits in ${hw.tops} TOPS, ` +
            `and the bandwidth ceiling is ~${Math.round(bandwidthCeiling)} tok/s. ` +
            `You'll need roughly ${memGB.toFixed(1)} GB of unified memory.`;
    } else if (cls === 'warn' && bandwidthCeiling < target) {
      msg = `<strong>Compute is fine, bandwidth is the limit.</strong> ` +
            `Your ${hw.name} (${hw.bandwidth} GB/s) caps out around ${Math.round(bandwidthCeiling)} tok/s on this model — ` +
            `below your ${target} tok/s target. Drop to a smaller / more quantized model, or pick a chip with more memory bandwidth (M4 Pro/Max).`;
    } else if (cls === 'warn') {
      msg = `<strong>Bandwidth is fine, but compute is tight.</strong> ` +
            `${effectiveTops.toFixed(1)} effective TOPS needed vs ${hw.tops} available. ` +
            `This is unusual for LLMs on Mac — it usually means your efficiency setting is conservative. ` +
            `In practice, the bandwidth ceiling (~${Math.round(bandwidthCeiling)} tok/s) is what you'll observe.`;
    } else {
      msg = `<strong>Likely not enough.</strong> ` +
            `Both compute (need ${effectiveTops.toFixed(1)} TOPS, have ${hw.tops}) and bandwidth ` +
            `(~${Math.round(bandwidthCeiling)} tok/s ceiling vs ${target} target) fall short. ` +
            `Try heavier quantization (4-bit → 3-bit), a smaller model, or a chip with more bandwidth.`;
    }

    if (memGB > 64) {
      msg += ` <em>Heads up: needs ${memGB.toFixed(0)} GB unified memory — only top-spec M-series configs ship with that much.</em>`;
    } else if (memGB > 32) {
      msg += ` <em>Needs ${memGB.toFixed(0)} GB unified memory — pick a 36 GB+ config.</em>`;
    }

    verdictEl.className = 'verdict ' + cls;
    verdictEl.innerHTML = msg;
  }

  // --- wiring ---------------------------------------------------------------
  function toggleCustomFields() {
    customParamsField.hidden = !MODELS[+modelEl.value].custom;
    customTargetField.hidden = targetPresetEl.value !== 'custom';
    const hwCustom = HARDWARE[+hardwareEl.value].custom;
    customTopsField.hidden = !hwCustom;
    customBwField.hidden = !hwCustom;
  }

  function init() {
    populate();
    toggleCustomFields();
    render();

    const inputs = [
      modelEl, customParamsEl, quantEl, targetPresetEl, customTargetEl,
      contextEl, efficiencyEl, hardwareEl, customTopsEl, customBwEl,
    ];
    inputs.forEach((el) => {
      el.addEventListener('input', () => { toggleCustomFields(); render(); });
      el.addEventListener('change', () => { toggleCustomFields(); render(); });
    });
  }

  init();
})();
