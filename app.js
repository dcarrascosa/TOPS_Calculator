// DOM wiring for the LLM TOPS Calculator.
// Pure calculation logic lives in calculator.js (window.Calculator).

(function () {
  const C = window.Calculator;
  const {
    MODELS, HARDWARE, compute, classifyVerdict, t,
    encodeStateToUrl, decodeStateFromUrl,
    buildComparison,
    buildMarkdownReport,
    fmtGB, fmtTops, fmtTps,
  } = C;

  const TARGET_PRESETS = ['5', '10', '20', '30', '60'];

  // --- language -------------------------------------------------------------
  const LANG_KEY = 'tops_calc_lang';
  let currentLang = localStorage.getItem(LANG_KEY) || 'en';

  function applyTranslations(lang) {
    currentLang = lang;
    localStorage.setItem(LANG_KEY, lang);
    document.documentElement.lang = lang;

    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = t(key, lang);
    });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => {
      const key = el.getAttribute('data-i18n-html');
      el.innerHTML = t(key, lang);
    });
    document.querySelectorAll('.lang-btn').forEach((btn) => {
      const active = btn.dataset.lang === lang;
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

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
  const shareBtn     = document.getElementById('shareBtn');
  const shareFeedback= document.getElementById('shareFeedback');
  const chartEl      = document.getElementById('chart');
  const copyMdBtn       = document.getElementById('copyMarkdownBtn');
  const downloadMdBtn   = document.getElementById('downloadMarkdownBtn');
  const exportFeedback  = document.getElementById('exportFeedback');

  let lastView = null;
  let lastResult = null;

  // --- populate selects -----------------------------------------------------
  function populate() {
    MODELS.forEach((m, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = m.name;
      if (m.name.startsWith('Llama 3.1 / 3 8B')) opt.selected = true;
      modelEl.appendChild(opt);
    });
    const groups = new Map();
    HARDWARE.forEach((h, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = h.tops
        ? `${h.name}  ·  ${h.tops} TOPS  ·  ${h.bandwidth} GB/s`
        : h.name;
      if (h.name === 'Apple M4') opt.selected = true;
      if (!h.group) {
        hardwareEl.appendChild(opt);
        return;
      }
      let og = groups.get(h.group);
      if (!og) {
        og = document.createElement('optgroup');
        og.label = h.group;
        hardwareEl.appendChild(og);
        groups.set(h.group, og);
      }
      og.appendChild(opt);
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

    syncUrl({ model, hw, target, quantBits, context, efficiency });
    renderChart({ hw, quantBits, target });

    lastView = { model, hw, target, quantBits, context, efficiency };
    lastResult = r;
  }

  // --- url sync -------------------------------------------------------------
  function currentStateForUrl({ model, hw, target, quantBits, context, efficiency }) {
    return {
      modelName:       model.name,
      customParams:    model.name === 'Custom' ? model.params : null,
      quantBits,
      target,
      context,
      efficiency,
      hardwareName:    hw.name,
      customTops:      hw.name === 'Custom' ? hw.tops : null,
      customBandwidth: hw.name === 'Custom' ? hw.bandwidth : null,
    };
  }

  function syncUrl(view) {
    const qs = encodeStateToUrl(currentStateForUrl(view));
    const newUrl = window.location.pathname + (qs ? '?' + qs : '');
    if (window.location.search !== '?' + qs) {
      window.history.replaceState(null, '', newUrl);
    }
  }

  function applyStateFromUrl() {
    const state = decodeStateFromUrl(window.location.search);

    if (state.modelName) {
      const idx = MODELS.findIndex((m) => m.name === state.modelName);
      if (idx >= 0) modelEl.value = String(idx);
    }
    if (state.customParams != null) customParamsEl.value = String(state.customParams);

    if (state.quantBits != null) quantEl.value = String(state.quantBits);

    if (state.target != null) {
      if (TARGET_PRESETS.includes(String(state.target))) {
        targetPresetEl.value = String(state.target);
      } else {
        targetPresetEl.value = 'custom';
        customTargetEl.value = String(state.target);
      }
    }

    if (state.context != null) contextEl.value = String(state.context);
    if (state.efficiency != null) efficiencyEl.value = String(state.efficiency);

    if (state.hardwareName) {
      const idx = HARDWARE.findIndex((h) => h.name === state.hardwareName);
      if (idx >= 0) hardwareEl.value = String(idx);
    }
    if (state.customTops != null) customTopsEl.value = String(state.customTops);
    if (state.customBandwidth != null) customBwEl.value = String(state.customBandwidth);
  }

  async function copyShareLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      shareFeedback.textContent = t('feedback.linkCopied', currentLang);
    } catch {
      shareFeedback.textContent = t('feedback.linkFailed', currentLang);
    }
    setTimeout(() => { shareFeedback.textContent = ''; }, 2500);
  }

  // --- chart ----------------------------------------------------------------
  function renderChart({ hw, quantBits, target }) {
    const data = buildComparison({ hw, quantBits, target });
    if (!data.length) {
      chartEl.innerHTML = `<p class="chart-help">${t('chart.pickHw', currentLang)}</p>`;
      return;
    }

    const W = 720, H = 240, padL = 40, padR = 20, padT = 24, padB = 56;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const max = Math.max(target, ...data.map((d) => d.ceiling || 0)) * 1.15;
    const xStep = innerW / data.length;
    const barW = Math.min(60, xStep - 14);

    const yFromValue = (v) => padT + innerH - (v / max) * innerH;
    const escapeXml = (s) => String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

    const bars = data.map((d, i) => {
      const x = padL + i * xStep + (xStep - barW) / 2;
      const value = Math.max(0.1, d.ceiling || 0);
      const y = yFromValue(value);
      const h = padT + innerH - y;
      const labelX = padL + i * xStep + xStep / 2;
      return `
        <rect class="bar ${d.verdict}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" />
        <text class="bar-value" x="${labelX.toFixed(1)}" y="${(y - 6).toFixed(1)}" text-anchor="middle">${fmtTps(value)}</text>
        <text class="bar-label" x="${labelX.toFixed(1)}" y="${(padT + innerH + 16).toFixed(1)}" text-anchor="middle">${escapeXml(d.name)}</text>
      `;
    }).join('');

    const targetY = yFromValue(target);
    const targetLine = `
      <line class="target-line" x1="${padL}" y1="${targetY.toFixed(1)}" x2="${(W - padR).toFixed(1)}" y2="${targetY.toFixed(1)}" />
      <text class="target-label" x="${(W - padR).toFixed(1)}" y="${(targetY - 4).toFixed(1)}" text-anchor="end">target ${target} tok/s</text>
    `;

    chartEl.innerHTML =
      `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">` +
      targetLine + bars +
      `</svg>`;
  }

  // --- markdown export ------------------------------------------------------
  function showExportFeedback(text) {
    exportFeedback.textContent = text;
    setTimeout(() => { exportFeedback.textContent = ''; }, 2500);
  }

  async function copyMarkdown() {
    if (!lastView || !lastResult) return;
    const md = buildMarkdownReport(lastView, lastResult);
    try {
      await navigator.clipboard.writeText(md);
      showExportFeedback(t('feedback.mdCopied', currentLang));
    } catch {
      showExportFeedback(t('feedback.mdFailed', currentLang));
    }
  }

  function downloadMarkdown() {
    if (!lastView || !lastResult) return;
    const md = buildMarkdownReport(lastView, lastResult);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tops-calculator-report.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showExportFeedback(t('feedback.downloaded', currentLang));
  }

  function renderVerdict({ model, hw, target, effectiveTops, bandwidthCeiling, totalBytes }) {
    const cls = classifyVerdict({ effectiveTops, bandwidthCeiling, target, hw });
    const memGB = totalBytes / 1e9;

    if (cls === 'unknown') {
      verdictEl.className = 'verdict';
      verdictEl.innerHTML = t('verdict.unknown', currentLang);
      return;
    }

    const vars = {
      model: model.name,
      hw: hw.name,
      hwTops: hw.tops,
      hwBw: hw.bandwidth,
      target,
      effTops: effectiveTops.toFixed(1),
      ceiling: Math.round(bandwidthCeiling),
      memGB: memGB.toFixed(1),
    };

    let key;
    if (cls === 'good') key = 'verdict.good';
    else if (cls === 'warn' && bandwidthCeiling < target) key = 'verdict.warnBw';
    else if (cls === 'warn') key = 'verdict.warnCompute';
    else key = 'verdict.bad';

    let msg = t(key, currentLang, vars);
    if (memGB > 64) {
      msg += t('verdict.memBig', currentLang, { memGB: memGB.toFixed(0) });
    } else if (memGB > 32) {
      msg += t('verdict.memMed', currentLang, { memGB: memGB.toFixed(0) });
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
    applyTranslations(currentLang);
    applyStateFromUrl();
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

    shareBtn.addEventListener('click', copyShareLink);
    copyMdBtn.addEventListener('click', copyMarkdown);
    downloadMdBtn.addEventListener('click', downloadMarkdown);

    document.querySelectorAll('.lang-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        applyTranslations(btn.dataset.lang);
        render();
      });
    });
  }

  init();
})();
