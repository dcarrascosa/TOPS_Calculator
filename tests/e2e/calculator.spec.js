const { test, expect } = require('@playwright/test');

// Helper: select an <option> by a substring of its visible text and fire
// `input`+`change` so the calculator re-renders.
async function selectByText(page, selector, substring) {
  await page.evaluate(
    ({ selector, substring }) => {
      const el = document.querySelector(selector);
      const opt = Array.from(el.options).find((o) => o.textContent.includes(substring));
      if (!opt) throw new Error(`no option containing "${substring}" in ${selector}`);
      el.value = opt.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    },
    { selector, substring }
  );
}

test.describe('LLM TOPS Calculator', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('loads with the right title and tagline', async ({ page }) => {
    await expect(page).toHaveTitle(/LLM TOPS Calculator/);
    await expect(page.locator('h1')).toContainText('LLM TOPS Calculator');
    await expect(page.locator('.tagline')).toBeVisible();
  });

  test('populates the model and hardware selects', async ({ page }) => {
    const modelOptions = await page.locator('#model option').count();
    const hwOptions    = await page.locator('#hardware option').count();
    expect(modelOptions).toBeGreaterThan(10);
    expect(hwOptions).toBeGreaterThan(10);
  });

  test('shows non-empty results out of the box (Llama 3 8B + M4 defaults)', async ({ page }) => {
    await expect(page.locator('#rawTops')).not.toHaveText('—');
    await expect(page.locator('#effectiveTops')).not.toHaveText('—');
    await expect(page.locator('#weightsMem')).toContainText('GB');
    await expect(page.locator('#kvMem')).not.toHaveText('—');
    await expect(page.locator('#totalMem')).toContainText('GB');
    await expect(page.locator('#bandwidthCeiling')).toContainText('tok/s');
  });

  test('default verdict for Llama 3 8B Q4 @ 20 t/s on M4 is good', async ({ page }) => {
    const verdict = page.locator('#verdict');
    await expect(verdict).toHaveClass(/good/);
    await expect(verdict).toContainText('Apple M4');
    await expect(verdict).toContainText('Llama');
  });

  test('switching to Llama 3.3 70B on M4 triggers a bandwidth warning', async ({ page }) => {
    await selectByText(page, '#model', 'Llama 3.3 / 3.1 70B');
    const verdict = page.locator('#verdict');
    await expect(verdict).toHaveClass(/warn|bad/);
    await expect(verdict).toContainText('bandwidth');
  });

  test('switching to M4 Max relaxes the bandwidth limit for 8B models', async ({ page }) => {
    await selectByText(page, '#hardware', 'Apple M4 Max');
    const ceilingText = await page.locator('#bandwidthCeiling').textContent();
    const ceiling = parseInt(ceilingText.replace(/[^\d]/g, ''), 10);
    expect(ceiling).toBeGreaterThan(60);
    await expect(page.locator('#verdict')).toHaveClass(/good/);
  });

  test('selecting a custom model reveals the parameter input', async ({ page }) => {
    await expect(page.locator('#customParamsField')).toBeHidden();
    await selectByText(page, '#model', 'Custom');
    await expect(page.locator('#customParamsField')).toBeVisible();
    await page.fill('#customParams', '13');
    await expect(page.locator('#weightsMem')).toContainText('GB');
  });

  test('selecting a custom target reveals the tok/s input and updates math', async ({ page }) => {
    await expect(page.locator('#customTargetField')).toBeHidden();
    await page.selectOption('#targetPreset', 'custom');
    await expect(page.locator('#customTargetField')).toBeVisible();

    const before = await page.locator('#rawTops').textContent();
    await page.fill('#customTarget', '120');
    const after = await page.locator('#rawTops').textContent();
    expect(after).not.toEqual(before);
  });

  test('selecting custom hardware reveals the TOPS and bandwidth fields', async ({ page }) => {
    await expect(page.locator('#customHardwareField')).toBeHidden();
    await expect(page.locator('#customBandwidthField')).toBeHidden();
    await selectByText(page, '#hardware', 'Custom');
    await expect(page.locator('#customHardwareField')).toBeVisible();
    await expect(page.locator('#customBandwidthField')).toBeVisible();
  });

  test('quantization choice changes the weights memory number', async ({ page }) => {
    const q4 = await page.locator('#weightsMem').textContent();
    await page.selectOption('#quant', '16');
    const fp16 = await page.locator('#weightsMem').textContent();
    expect(fp16).not.toEqual(q4);
    expect(parseFloat(fp16)).toBeGreaterThan(parseFloat(q4));
  });

  test('changing context length affects KV cache memory', async ({ page }) => {
    await page.selectOption('#context', '2048');
    const small = await page.locator('#kvMem').textContent();
    await page.selectOption('#context', '32768');
    const big = await page.locator('#kvMem').textContent();
    expect(small).not.toEqual(big);
  });

  test('explainer section is rendered', async ({ page }) => {
    await expect(page.locator('.explainer')).toContainText('memory bandwidth');
    await expect(page.locator('.explainer')).toContainText('Neural Engine');
  });

  test('hardware dropdown groups options by vendor with optgroups', async ({ page }) => {
    const groupLabels = await page.locator('#hardware optgroup').evaluateAll(
      (els) => els.map((e) => e.label)
    );
    expect(groupLabels).toContain('Apple Silicon');
    expect(groupLabels).toContain('NVIDIA GeForce');
    expect(groupLabels).toContain('AMD Radeon');
  });

  test('selecting an NVIDIA gpu updates the verdict and bandwidth ceiling', async ({ page }) => {
    await selectByText(page, '#hardware', 'NVIDIA RTX 4090');
    await expect(page.locator('#verdict')).toHaveClass(/good/);
    const ceiling = await page.locator('#bandwidthCeiling').textContent();
    expect(parseInt(ceiling.replace(/[^\d]/g, ''), 10)).toBeGreaterThan(100);
  });

  test('updates the url querystring as inputs change', async ({ page }) => {
    await selectByText(page, '#hardware', 'Apple M4 Max');
    await page.selectOption('#quant', '8');
    const url = page.url();
    expect(url).toContain('h=Apple+M4+Max');
    expect(url).toContain('q=8');
  });

  test('restores state from a share link on load', async ({ page }) => {
    const link = '/?m=Mistral+7B&q=8&t=30&c=16384&e=0.4&h=Apple+M4+Max';
    await page.goto(link);

    expect(await page.locator('#model option:checked').textContent()).toBe('Mistral 7B');
    expect(await page.locator('#quant').inputValue()).toBe('8');
    expect(await page.locator('#targetPreset').inputValue()).toBe('30');
    expect(await page.locator('#context').inputValue()).toBe('16384');
    expect(await page.locator('#efficiency').inputValue()).toBe('0.4');
    expect((await page.locator('#hardware option:checked').textContent()) || '').toContain('Apple M4 Max');
  });

  test('share button copies the url and shows feedback', async ({ context, page }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.click('#shareBtn');
    await expect(page.locator('#shareFeedback')).toHaveText('Link copied');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain('?');
  });

  test('comparison chart renders with one bar per preset', async ({ page }) => {
    await expect(page.locator('.chart-card h2')).toContainText('What fits your hardware');
    const bars = await page.locator('.chart svg rect.bar').count();
    expect(bars).toBeGreaterThanOrEqual(5);
  });

  test('chart bars recolor when the target tokens/sec changes', async ({ page }) => {
    // Default target 20 — get bar classes
    const at20 = await page.locator('.chart svg rect.bar').evaluateAll(
      (els) => els.map((e) => e.getAttribute('class'))
    );
    // Crank target to 60 — some good bars should drop to warn/bad
    await page.selectOption('#targetPreset', '60');
    const at60 = await page.locator('.chart svg rect.bar').evaluateAll(
      (els) => els.map((e) => e.getAttribute('class'))
    );
    expect(at60).not.toEqual(at20);
  });

  test('declares an inline svg favicon (no /favicon.ico 404)', async ({ page }) => {
    const requests404 = [];
    page.on('response', (res) => {
      if (res.status() === 404) requests404.push(res.url());
    });
    await page.reload();
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href).toMatch(/^data:image\/svg\+xml/);
    expect(requests404.filter((u) => u.endsWith('/favicon.ico'))).toEqual([]);
  });
});
