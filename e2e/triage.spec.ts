import { test, expect, fileIssue } from "./fixtures";

test.use({ as: "admin" });

test("triage changes stick after saving and reloading", async ({ page, uniq, me }) => {
  await fileIssue(page, uniq("Triage check"));

  await page.locator("#status").selectOption("in_progress");
  await page.locator("#severity").selectOption("high");
  const assignee = page.locator("#assigneeId");
  await assignee.click();
  await assignee.fill(me.split(" ")[0]);
  await page.getByRole("option", { name: new RegExp(me) }).first().click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();

  // The #261 regression: the selects used to snap back to the old values.
  await expect(page.locator("#status")).toHaveValue("in_progress");
  await page.reload();
  await expect(page.locator("#status")).toHaveValue("in_progress");
  await expect(page.locator("#severity")).toHaveValue("high");
  // The status chip lives in the side rail's Status box.
  await expect(page.getByRole("region", { name: "Status" }).getByText("In progress")).toBeVisible();
  await expect(page.getByText(me).filter({ visible: true }).first()).toBeVisible();
});
