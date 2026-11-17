// QA-only: intercepts /api/public/summary in the browser so the guest portal can
// be verified against realistic database rows without a live DATABASE_URL.
// Usage: node <skill>/browser.mjs http://127.0.0.1:3000 --script scripts/qa-seed-summary.mjs
export default async function run(page) {
  const payload = {
    success: true,
    totalMembers: 42,
    activeMembers: 38,
    officers: [
      { role: 'President', name: 'Maria L. Santillan' },
      { role: 'Vice President', name: 'Jose P. Abella' },
      { role: 'Secretary', name: 'Lourdes M. Tan' },
      { role: 'Treasurer', name: 'Ricardo B. Uy' },
      { role: 'Auditor', name: 'Elena C. Ramos' },
      { role: 'PIO', name: 'Ida S. Manera' },
    ],
    boardMembers: ['Pedro A. Lim', 'Rosa D. Cruz', 'Miguel T. Reyes'],
    announcements: [
      { id: 'ann-2', title: 'General Assembly on Dec 5', category: 'Meeting', content: 'All members are required to attend.', datePosted: '2026-11-15', priority: 'High', postedBy: 'Ida S. Manera' },
      { id: 'ann-1', title: 'Fertilizer Subsidy Now Available', category: 'Assistance', content: 'Claim at the barangay hall.', datePosted: '2026-11-02', priority: 'Medium', postedBy: 'Ida S. Manera' },
    ],
    activities: [
      { id: 'act-2', title: 'Harvest Fair', cebTitle: 'Pista sa Ani', category: 'Harvest Fair', scheduledDate: '2026-12-05', scheduledTime: '08:00', location: 'Alegria Covered Court', description: 'Annual harvest fair.', organizer: 'PIO', status: 'Scheduled', targetAudience: 'All members', attendeesCount: 120 },
      { id: 'act-1', title: 'Cooperative Training', cebTitle: 'Hanás sa Kooperatiba', category: 'Training', scheduledDate: '2026-11-28', scheduledTime: '13:00', location: 'Barangay Hall', description: 'Bookkeeping basics.', organizer: 'PIO', status: 'Scheduled', targetAudience: 'Officers', attendeesCount: 25 },
    ],
  };

  await page.route('**/api/public/summary', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) })
  );

  await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.body.innerText.includes('42'), { timeout: 20000 });

  const home = {
    memberCount: /(\d+)\s*Miyembro/.exec(await page.innerText('body'))?.[1],
    announcementsOnHome: await page.locator('text=General Assembly on Dec 5').count(),
    activitiesOnHome: await page.locator('text=Harvest Fair').count(),
  };

  await page.getByRole('button', { name: /Pahibalo/ }).click();
  await page.waitForTimeout(600);
  const announcementsTab = {
    newer: await page.locator('text=Fertilizer Subsidy Now Available').count(),
    postsBy: await page.locator('text=Ida S. Manera').count(),
  };

  await page.getByRole('button', { name: /Kalihokan/ }).click();
  await page.waitForTimeout(600);
  const activitiesTab = {
    training: await page.locator('text=Cooperative Training').count(),
    location: await page.locator('text=Barangay Hall').count(),
  };

  await page.getByRole('button', { name: /Kasaysayan/ }).click();
  await page.waitForTimeout(600);
  const historyTab = {
    president: await page.locator('text=Maria L. Santillan').count(),
    treasurer: await page.locator('text=Ricardo B. Uy').count(),
    boardMember: await page.locator('text=Pedro A. Lim').count(),
  };

  await page.screenshot({ path: '.qa-history.png', fullPage: false });

  return { home, announcementsTab, activitiesTab, historyTab };
}
