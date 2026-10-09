// Log in as President, open the President's Report, and capture what renders.
export default async function run(page, ui) {
  const steps = [];

  // 1. Open the officer login
  await ui.click('@e12'); // "Access Member / Officer Portal"
  await page.waitForTimeout(800);
  steps.push({ afterOpenLogin: await ui.snapshot() });

  // 2. Snapshot the login form to find the fields
  const form = await ui.snapshot();
  steps.push({ loginForm: form });

  const userBox = form.match(/@(e\d+) (?:textbox|input)[^\n]*/i)?.[1];
  return { note: 'inspect', steps, bodyText: (await page.locator('body').innerText()).slice(0, 800) };
}
