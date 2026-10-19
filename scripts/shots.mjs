// Screenshot helper: node scripts/shots.mjs <outDir> <width>x<height> url[=name] ...
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const [outDir, size, ...targets] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, reducedMotion: "reduce" });
for (const t of targets) {
  const [url, name] = t.split("|");
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const file = `${outDir}/${name ?? url.replace(/[^a-z0-9]+/gi, "_")}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  await page.close();
}
await browser.close();
