// Find text nodes whose computed color is too close to their effective background.
export default async function run(page, ui) {
  return await page.evaluate(runInPage);
}

function runInPage() {
  function parseRGB(str) {
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map(s => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] === undefined ? 1 : parts[3] };
  }
  function lum(c) {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    const L1 = lum(a), L2 = lum(b);
    const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  }
  function effBg(el) {
    let node = el;
    while (node && node !== document.documentElement) {
      const bg = parseRGB(getComputedStyle(node).backgroundColor);
      if (bg && bg.a > 0.05) return bg;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }
  const problems = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n;
  const seen = new Set();
  while ((n = walker.nextNode())) {
    const text = (n.textContent || '').trim();
    if (!text || text.length < 2) continue;
    const el = n.parentElement;
    if (!el) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const fg = parseRGB(cs.color);
    if (!fg) continue;
    const bg = effBg(el);
    // blend fg over bg if partially transparent
    let fgc = fg;
    if (fg.a < 1) {
      fgc = {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a)
      };
    }
    const ratio = contrast(fgc, bg);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const bold = (parseInt(cs.fontWeight) || 400) >= 700;
    const largeText = fontSize >= 24 || (fontSize >= 18.66 && bold);
    const min = largeText ? 3.0 : 4.5;
    if (ratio < min) {
      const key = text.slice(0, 40) + '|' + cs.color + '|' + JSON.stringify(bg);
      if (seen.has(key)) continue;
      seen.add(key);
      problems.push({
        text: text.slice(0, 60),
        color: cs.color,
        bg: `rgb(${bg.r},${bg.g},${bg.b})`,
        ratio: Math.round(ratio * 100) / 100,
        need: min,
        tag: el.tagName,
        cls: (el.className || '').toString().slice(0, 80)
      });
    }
  }
  return problems;
}
