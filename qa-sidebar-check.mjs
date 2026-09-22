export default async function run(page, ui) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);

  let snap = await ui.snapshot();
  const login1 = snap.match(/@(e\d+) button "Log In"/)?.[1];
  if (login1) { await ui.click(login1); await page.waitForTimeout(800); }

  snap = await ui.snapshot();
  const presBtn = snap.match(/@(e\d+) button "Zenaida PRESIDENT"/)?.[1];
  if (presBtn) { await ui.click(presBtn); await page.waitForTimeout(600); }

  snap = await ui.snapshot();
  let pwd = snap.match(/@(e\d+) textbox "Ipapilit/)?.[1];
  const pwdAlt = snap.match(/@(e\d+) textbox/)?.[1];
  pwd = pwd || pwdAlt;
  if (pwd) { await ui.fill(pwd, 'password123'); await page.waitForTimeout(400); }

  snap = await ui.snapshot();
  const submit = [...snap.matchAll(/@(e\d+) button "([^"]*)"/g)].find(m => /log in/i.test(m[2]))?.[1];
  if (submit) { await ui.click(submit); await page.waitForTimeout(2500); }

  const results = {};

  // 1. Sidebar should start at "Main Views" (no brand/session card)
  results.sidebarStartsAtMainViews = await page.evaluate(() => {
    const aside = document.getElementById('officer-left-sidebar');
    if (!aside) return false;
    const firstText = aside.textContent.trim().slice(0, 30);
    return firstText.startsWith('Main Views');
  });
  results.sidebarHasSessionCard = await page.evaluate(() =>
    !!document.getElementById('officer-left-sidebar')?.textContent.includes('President')
  );

  // 2. Scroll far down, click a nav button, verify page returns to top
  await page.evaluate(() => window.scrollTo(0, 3000));
  await page.waitForTimeout(500);
  results.scrolledDown = await page.evaluate(() => window.scrollY > 1000);

  await page.evaluate(() => document.getElementById('sidebar-nav-announcements')?.click());
  await page.waitForTimeout(1200);
  results.backAtTopAfterClick = await page.evaluate(() => window.scrollY < 50);
  results.announcementsVisible = await page.evaluate(() => !!document.getElementById('officer-announcements-window'));

  // Repeat for another tab
  await page.evaluate(() => window.scrollTo(0, 4000));
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('sidebar-nav-tasks')?.click());
  await page.waitForTimeout(1200);
  results.backAtTopAfterSecondClick = await page.evaluate(() => window.scrollY < 50);
  results.tasksVisible = await page.evaluate(() => !!document.getElementById('officer-dashboard-window'));

  await page.screenshot({ path: 'sidebar-final.png' });
  return results;
}
