import { chromium } from "@playwright/test";
import path from "path";

async function run() {
  console.log("Starting browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  
  console.log("Navigating to login...");
  await page.goto("http://localhost:3000/");
  
  await page.fill("input[type='email']", "admin@flowboard.local");
  await page.fill("input[type='password']", "Admin@123456");
  await page.click("button.login-submit");
  
  console.log("Waiting for dashboard...");
  await page.waitForURL("**/dashboard/workbench");
  
  const artifactDir = process.env.ARTIFACT_DIR || process.cwd();
  const screen1 = path.join(artifactDir, "workbench.png");
  await page.screenshot({ path: screen1, fullPage: true });
  console.log("Saved", screen1);

  console.log("Navigating to projects...");
  await page.click("a[href='/dashboard/projects']");
  await page.waitForURL("**/dashboard/projects");
  
  await page.waitForTimeout(2000);
  
  const screen2 = path.join(artifactDir, "projects.png");
  await page.screenshot({ path: screen2, fullPage: true });
  console.log("Saved", screen2);

  console.log("Navigating to board...");
  await page.click("a[href='/dashboard/board']");
  await page.waitForURL("**/dashboard/board");
  
  await page.waitForTimeout(2000);
  
  const screen3 = path.join(artifactDir, "board.png");
  await page.screenshot({ path: screen3, fullPage: true });
  console.log("Saved", screen3);
  
  await browser.close();
  console.log("Browser test complete.");
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
