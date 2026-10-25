import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Keep the iOS/Android icon, launch screen and web mark on the same vector source.
const source = await readFile(new URL("../public/icon.svg", import.meta.url));
const asset = (name) =>
  fileURLToPath(new URL(`../mobile/assets/${name}`, import.meta.url));
await sharp(source, { density: 768 })
  .resize(1024, 1024)
  .flatten({ background: "#193d33" })
  .removeAlpha()
  .png()
  .toFile(asset("icon.png"));
const mark = await sharp(source, { density: 300 })
  .resize(240, 240)
  .png()
  .toBuffer();
await sharp({
  create: { width: 720, height: 720, channels: 3, background: "#f8f7f1" },
})
  .composite([{ input: mark, left: 240, top: 240 }])
  .removeAlpha()
  .png()
  .toFile(asset("splash.png"));
console.log("Updated native icon and splash from public/icon.svg.");
