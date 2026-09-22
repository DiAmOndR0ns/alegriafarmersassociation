export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const steps = [];
  const snapText = async () => {
    const s = await ui.snapshot();
    steps.push(s);
    return s;
  };

  // Step 1: guest portal -> click Log In
  let snap = await snapText();
  const login1 = snap.match(/@(e\d+) button "Log In"/)?.[1];
  if (login1) {
    await ui.click(login1);
    await page.waitForTimeout(800);
  }

  // Step 2: auth screen -> pick President quick button or fill form
  snap = await snapText();
  const presBtn = snap.match(/@(e\d+) button "Zenaida PRESIDENT"/)?.[1];
  if (presBtn) {
    await ui.click(presBtn);
    await page.waitForTimeout(600);
  }

  snap = await snapText();
  let pwd = snap.match(/@(e\d+) textbox "Ipapilit/)?.[1];
  const pwdAlt = snap.match(/@(e\d+) textbox/)?.[1];
  pwd = pwd || pwdAlt;
  if (pwd) {
    await ui.fill(pwd, "password123");
    await page.waitForTimeout(400);
  }

  snap = await snapText();
  const submit = [...snap.matchAll(/@(e\d+) button "([^"]*)"/g)].find((m) =>
    /log in/i.test(m[2]),
  )?.[1];
  if (submit) {
    await ui.click(submit);
    await page.waitForTimeout(2500);
  }

  const results = {};
  results.innerWidth = await page.evaluate(() => innerWidth);
  results.sidebarPresent = await page.evaluate(
    () => !!document.getElementById("officer-left-sidebar"),
  );
  results.sidebarRect = await page.evaluate(() => {
    const el = document.getElementById("officer-left-sidebar");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      left: r.left,
      width: r.width,
      height: r.height,
      visible: r.width > 100,
    };
  });

  // Click each sidebar nav item and verify the corresponding view mounts
  for (const tab of ["announcements", "hog-raising", "member-view", "tasks"]) {
    await page.evaluate(
      (t) => document.getElementById(`sidebar-nav-${t}`)?.click(),
      tab,
    );
    await page.waitForTimeout(600);
    results[tab] = await page.evaluate((t) => {
      const map = {
        tasks: "officer-dashboard-window",
        "hog-raising": "officer-hog-raising-window",
        announcements: "officer-announcements-window",
        "member-view": "officer-member-view-window",
      };
      return {
        viewVisible: !!document.getElementById(map[t]),
        markedActive:
          document
            .getElementById(`sidebar-nav-${t}`)
            ?.getAttribute("aria-current") === "page",
      };
    }, tab);
  }

  // Sync queue scroll
  await page.evaluate(() =>
    document.getElementById("sidebar-nav-sync")?.click(),
  );
  await page.waitForTimeout(900);
  results.syncQueueScrolled = await page.evaluate(() => {
    const el = document.getElementById("sync-queue-panel-window");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.top > -100 && r.top < window.innerHeight;
  });

  // Content should not sit under the sidebar
  results.contentClearOfSidebar = await page.evaluate(() => {
    const main = document.querySelector("#application-root main");
    if (!main) return false;
    return main.getBoundingClientRect().left >= 280;
  });

  // Contrast audit
  results.contrastIssues = await page.evaluate(() => {
    function parseRGB(str) {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(",").map((s) => parseFloat(s.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
    }
    function lum(c) {
      const f = (v) => {
        v /= 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.072 * f(c.b);
    }
    function contrast(a, b) {
      const L1 = lum(a),
        L2 = lum(b);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
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
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
    );
    let n;
    const seen = new Set();
    while ((n = walker.nextNode())) {
      const text = (n.textContent || "").trim();
      if (!text || text.length < 2) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        parseFloat(cs.opacity) < 0.1
      )
        continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fg = parseRGB(cs.color);
      if (!fg) continue;
      const bg = effBg(el);
      let fgc = fg;
      if (fg.a < 1)
        fgc = {
          r: fg.r * fg.a + bg.r * (1 - fg.a),
          g: fg.g * fg.a + bg.g * (1 - fg.a),
          b: fg.b * fg.a + bg.b * (1 - fg.a),
        };
      const ratio = contrast(fgc, bg);
      const fontSize = parseFloat(cs.fontSize) || 16;
      const bold = (parseInt(cs.fontWeight) || 400) >= 700;
      const largeText = fontSize >= 24 || (fontSize >= 18.66 && bold);
      const min = largeText ? 3.0 : 4.5;
      if (ratio < min) {
        const key = text.slice(0, 40) + "|" + cs.color;
        if (seen.has(key)) continue;
        seen.add(key);
        problems.push({
          text: text.slice(0, 50),
          color: cs.color,
          bg: `rgb(${bg.r},${bg.g},${bg.b})`,
          ratio: Math.round(ratio * 100) / 100,
          size: fontSize,
        });
      }
    }
    return problems.slice(0, 20);
  });

  results.tinyFontCount = await page.evaluate(
    () =>
      Array.from(document.querySelectorAll("*")).filter((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none") return false;
        const fs = parseFloat(cs.fontSize);
        return (
          fs < 11 &&
          (el.textContent || "").trim().length > 1 &&
          el.children.length === 0
        );
      }).length,
  );

  await page.screenshot({ path: "sidebar-check.png" });
  results.firstStepSnapshot = steps[0]?.slice(0, 600);
  return results;
}
