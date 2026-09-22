export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  // Log in as Secretary (need templates modal + tab pill)
  let snap = await ui.snapshot();
  const login1 = snap.match(/@(e\d+) button "Log In"/)?.[1];
  if (login1) { await ui.click(login1); await page.waitForTimeout(800); }

  snap = await ui.snapshot();
  const secBtn = [...snap.matchAll(/@(e\d+) button "([^"]*)"/g)]
    .find(m => /SECRETARY/i.test(m[2]))?.[1];
  if (secBtn) { await ui.click(secBtn); await page.waitForTimeout(600); }

  snap = await ui.snapshot();
  const pwd = snap.match(/@(e\d+) textbox "Ipapilit/)?.[1]
    || snap.match(/@(e\d+) textbox/)?.[1];
  if (pwd) { await ui.fill(pwd, "password123"); await page.waitForTimeout(400); }

  snap = await ui.snapshot();
  const submit = [...snap.matchAll(/@(e\d+) button "([^"]*)"/g)]
    .find(m => /log in/i.test(m[2]))?.[1];
  if (submit) { await ui.click(submit); await page.waitForTimeout(2500); }

  const results = {};

  // ---- CHECK 1: tab pill must NOT overflow its container ----
  results.tabPill = await page.evaluate(() => {
    const ids = ["tab-members", "tab-meetings", "tab-resolutions"];
    const btns = ids.map(id => document.getElementById(id));
    if (btns.some(b => !b)) return { error: "tab buttons missing" };
    const container = btns[0].parentElement;
    const cRect = container.getBoundingClientRect();
    return {
      containerRight: Math.round(cRect.right),
      containerLeft: Math.round(cRect.left),
      lastBtnRight: Math.round(btns[2].getBoundingClientRect().right),
      overflowsRight: btns[2].getBoundingClientRect().right > cRect.right + 1,
      btnsInsideContainer: btns.every(b => {
        const r = b.getBoundingClientRect();
        return r.left >= cRect.left - 1 && r.right <= cRect.right + 1;
      }),
      widths: btns.map(b => Math.round(b.getBoundingClientRect().width)),
      labels: btns.map(b => (b.textContent || "").trim()),
    };
  });

  // ---- CHECK 2: templates modal subtitle contrast on green header ----
  // Open the templates modal via its button
  const tmplBtn = await page.evaluate(() =>
    document.getElementById("secretary-templates-btn") ? "found" : "missing");
  results.templatesBtn = tmplBtn;

  if (tmplBtn === "found") {
    await page.evaluate(() => document.getElementById("secretary-templates-btn").click());
    await page.waitForTimeout(900);

    results.templatesSubtitle = await page.evaluate(() => {
      function parseRGB(str) {
        const m = str.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(",").map(s => parseFloat(s.trim()));
        return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
      }
      function lum(c) {
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
      }
      function contrast(a, b) {
        const L1 = lum(a), L2 = lum(b);
        return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      }
      // find the subtitle paragraph
      const all = Array.from(document.querySelectorAll("p"));
      const el = all.find(p => /Official Letter of Intent, Board Resolution/.test(p.textContent || ""));
      if (!el) return { error: "subtitle not found" };

      const cs = getComputedStyle(el);
      let node = el, bg = null;
      while (node && node !== document.documentElement) {
        const c = parseRGB(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0.05) { bg = c; break; }
        node = node.parentElement;
      }
      const fg = parseRGB(cs.color);
      return {
        text: (el.textContent || "").trim().slice(0, 60),
        color: cs.color,
        bg: bg ? `rgb(${bg.r},${bg.g},${bg.b})` : "none",
        ratio: bg ? Math.round(contrast(fg, bg) * 100) / 100 : null,
        readable: bg ? contrast(fg, bg) >= 4.5 : false,
      };
    });

    await page.screenshot({ path: "templates-modal.png" });
  }

  return results;
}
