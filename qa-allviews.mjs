// Scan contrast across roles by injecting a current user and reloading.
const OFFICERS = {
  President: {
    id: "user-pres",
    username: "president",
    name: "Zenaida A. Elbiña",
    role: "President",
    isApproved: true,
  },
  Secretary: {
    id: "user-sec",
    username: "secretary",
    name: "Jennylyn S Lumactao",
    role: "Secretary",
    isApproved: true,
  },
  Treasurer: {
    id: "user-tres",
    username: "treasurer",
    name: "Gracelyn P Asendiente",
    role: "Treasurer",
    isApproved: true,
  },
  PIO: {
    id: "user-pio",
    username: "pio",
    name: "Ida S Manera",
    role: "PIO",
    isApproved: true,
  },
  Member: {
    id: "member-scan",
    username: "scanmember",
    name: "Scan Member",
    role: "Member",
    isApproved: true,
  },
};

const scan = function () {
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
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  }
  function contrast(a, b) {
    const L1 = lum(a),
      L2 = lum(b);
    const hi = Math.max(L1, L2),
      lo = Math.min(L1, L2);
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
  while ((n = walker.nextNode())) {
    const text = (n.textContent || "").trim();
    if (!text || text.length < 2) continue;
    const el = n.parentElement;
    if (!el) continue;
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
    if (fg.a < 1) {
      fgc = {
        r: fg.r * fg.a + bg.r * (1 - fg.a),
        g: fg.g * fg.a + bg.g * (1 - fg.a),
        b: fg.b * fg.a + bg.b * (1 - fg.a),
      };
    }
    const ratio = contrast(fgc, bg);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const bold = (parseInt(cs.fontWeight) || 400) >= 700;
    const largeText = fontSize >= 24 || (fontSize >= 18.66 && bold);
    const min = largeText ? 3.0 : 4.5;
    if (ratio < min) {
      const key =
        text.slice(0, 40) +
        "|" +
        cs.color +
        "|" +
        bg.r +
        "," +
        bg.g +
        "," +
        bg.b +
        "|" +
        (el.className || "");
      if (problems.some((p) => p._k === key)) continue;
      problems.push({
        _k: key,
        text: text.slice(0, 55),
        color: cs.color,
        bg: `rgb(${bg.r},${bg.g},${bg.b})`,
        ratio: Math.round(ratio * 100) / 100,
        cls: (el.className || "").toString().slice(0, 90),
      });
    }
  }
  return problems.map(({ _k, ...rest }) => rest);
};

export default async function run(page, ui) {
  const out = {};
  // Navigate first so origin/localStorage is available
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    localStorage.removeItem("bafa_current_user");
    localStorage.removeItem("bafa_members");
  });
  await page.goto("http://localhost:3000/");
  await page.waitForTimeout(1500);
  out.Guest = await page.evaluate(scan);

  for (const [role, user] of Object.entries(OFFICERS)) {
    if (role === "Member") {
      await page.evaluate((u) => {
        localStorage.setItem("bafa_current_user", JSON.stringify(u));
        localStorage.removeItem("bafa_members");
      }, user);
    } else {
      await page.evaluate((u) => {
        localStorage.setItem("bafa_current_user", JSON.stringify(u));
      }, user);
    }
    await page.goto("http://localhost:3000/");
    await page.waitForTimeout(1800);
    out[role] = await page.evaluate(scan);
  }
  return out;
}
