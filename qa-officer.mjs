export default async function run(page, ui) {
  let snap = await ui.snapshot();
  const loginLink = snap.match(/@(e\d+) button "Log In"/)?.[1];
  if (loginLink) {
    await ui.click(loginLink);
    await page.waitForTimeout(700);
  }

  snap = await ui.snapshot();
  const presBtn = snap.match(/@(e\d+) button "Zenaida PRESIDENT"/)?.[1];
  if (presBtn) {
    await ui.click(presBtn);
    await page.waitForTimeout(500);
  }

  snap = await ui.snapshot();
  const pwd = snap.match(/@(e\d+) textbox "Ipapilit/)?.[1];
  const pwdAlt = snap.match(/@(e\d+) textbox/)?.[1];
  const pwdRef = pwd || pwdAlt;
  if (pwdRef) {
    await ui.fill(pwdRef, "password123");
    await page.waitForTimeout(300);
  }

  snap = await ui.snapshot();
  const submit = snap.match(/@(e\d+) button "Log In"/)?.[1];
  if (submit) {
    await ui.click(submit);
    await page.waitForTimeout(2500);
  }

  snap = await ui.snapshot({ full: true });
  return snap;
}
