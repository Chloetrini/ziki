import { test, expect, reportIssue } from "./fixtures";
import { e2eDb } from "./db";

/** A new report is an idea; a manager agent converting it makes it an issue that takes comments. */
async function convertToIssue(url: string) {
  const number = Number(new URL(url).pathname.split("/").pop());
  const prisma = e2eDb();
  try {
    await prisma.bug.updateMany({ where: { number, convertedToIssueAt: null }, data: { convertedToIssueAt: new Date() } });
  } finally {
    await prisma.$disconnect();
  }
}

test("an idea takes verdicts, not comments", async ({ page, uniq }) => {
  await reportIssue(page, uniq("Idea verdict check"));
  await expect(page.getByRole("heading", { name: /Idea verdicts/i })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add comment" })).toHaveCount(0);
});

test("comments on an issue and replies to the comment", async ({ page, uniq }) => {
  const url = await reportIssue(page, uniq("Comment thread check"));
  await convertToIssue(url);
  await page.reload();

  // The comments themselves, not the activity log that quotes them.
  const thread = page.locator("[id^='comment-']");
  const comment = `Same here on Firefox ${Date.now()}`;
  // The comment form opens in a dialog from "Add comment".
  await page.getByRole("button", { name: "Add comment" }).click();
  const dialog = page.getByRole("dialog", { name: "Add comment" });
  await dialog.locator("textarea#body").fill(comment);
  await dialog.getByRole("button", { name: /Post to conversation|Post comment/ }).click();
  await expect(dialog).toBeHidden();
  await expect(thread.getByText(comment).first()).toBeVisible();

  const reply = `Fixed by clearing the cache ${Date.now()}`;
  await page.getByRole("button", { name: "Reply" }).first().click();
  const replyBox = page.locator("textarea[id^='body-']").first();
  await replyBox.fill(reply);
  await page.getByRole("button", { name: /Post reply|Reply/ }).last().click();
  await expect(thread.getByText(reply).first()).toBeVisible();
  await expect(page.getByText(/Replying to/).first()).toBeVisible();

  // Both survive a reload: they were saved, not just drawn.
  await page.reload();
  await expect(thread.getByText(comment).first()).toBeVisible();
  await expect(thread.getByText(reply).first()).toBeVisible();
});
