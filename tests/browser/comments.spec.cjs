const { test, expect } = require('@playwright/test');
const { setup, note } = require('./fixtures.cjs');

async function enterNote(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Choose €20', exact: true }).click();
  await page.getByLabel('Country', { exact: true }).fill(note.country);
  await page.getByLabel('City', { exact: true }).fill(note.city);
  await page.locator('#printer-code').fill(note.printerCode);
  await page.locator('#serial-number').fill(note.serial);
}

test('a comment suggestion applies when touch release is retargeted and click is missing', async ({ page }) => {
  await setup(page, { signedIn: true });
  await page.route('**/api/ebt/suggestions?kind=comments&*', route => route.fulfill({
    json: { data: [{ comment: 'Café', amount: 3 }] },
  }));
  await enterNote(page);
  const comment = page.locator('#entry-comment');
  await comment.focus();
  await page.getByRole('button', { name: /Café/ }).evaluate(button => {
    const field = document.activeElement;
    const list = button.closest('.field-suggestions');
    const bounds = button.getBoundingClientRect();
    const touch = { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 7,
      button: 0, isPrimary: true, clientX: bounds.left + bounds.width / 2,
      clientY: bounds.top + bounds.height / 2 };
    button.dispatchEvent(new PointerEvent('pointerdown', touch));
    field.blur();
    list.dispatchEvent(new PointerEvent('pointerup', touch));
  });
  await expect(comment).toHaveValue('Café');
});

test('the latest comment reaches EBT when the note is queued before the form rerenders', async ({ page }) => {
  await setup(page, { signedIn: true });
  await page.route('**/api/ebt/suggestions?kind=comments&*', route => route.fulfill({
    json: { data: [{ comment: 'Café & bakery', amount: 3 }] },
  }));
  await page.route('**/api/ebt/notes', route => {
    const [submitted] = route.request().postDataJSON().notes;
    return route.fulfill({ json: { results: [{ id: submitted.id, result: { status: 1, billId: 42 } }] } });
  });
  await enterNote(page);
  await page.locator('#entry-comment').fill('Café');
  const add = page.getByRole('button', { name: /Add note to queue/ });
  await expect(add).toBeEnabled();
  await page.getByRole('button', { name: /Café & bakery/ }).evaluate(suggestion => {
    suggestion.click();
    document.querySelector('.entry-panel button.save').click();
  });
  await page.getByRole('button', { name: /^Queue/ }).click();
  const [submission] = await Promise.all([
    page.waitForRequest(request => request.url().endsWith('/api/ebt/notes') && request.method() === 'POST'),
    page.getByRole('button', { name: 'Submit queue (1)' }).click(),
  ]);
  expect(submission.postDataJSON().notes[0].comment).toBe('Café & bakery');
});
