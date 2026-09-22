export default async function run(page, ui) {
  // Go to the login screen
  const before = await ui.snapshot();
  const loginBtn = before.match(/@(e\d+) button "Log In"/)?.[1];
  if (loginBtn) {
    await ui.click(loginBtn);
    await page.waitForTimeout(800);
  }
  const snap = await ui.snapshot();
  return { afterLoginClick: snap };
}
