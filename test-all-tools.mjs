import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:9090';
const DOWNLOAD_DIR = 'C:/Users/capy1/Desktop/front end2/test-downloads';
const DIR = 'C:/Users/capy1/Desktop/front end2';

if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

async function goToTool(page, toolId) {
  // Use evaluate to change hash directly — avoids page.goto race condition
  await page.evaluate((id) => { window.location.hash = `tool?id=${id}`; }, toolId);
  await page.waitForTimeout(600);
  // Ensure dropzone is visible (tool initialized)
  await page.locator('#file-dropzone').waitFor({ state: 'visible', timeout: 10000 });
}

async function uploadAndProcess(page, filePath, opts = {}) {
  // Upload file
  const fileInput = page.locator('#file-input');
  await fileInput.setInputFiles(filePath);
  // Playwright's setInputFiles doesn't reliably fire 'change' on display:none
  // inputs after tool processing cycles. Dispatch manually to be safe.
  await page.evaluate(() => {
    const fi = document.getElementById('file-input');
    if (fi && fi.files.length) {
      fi.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  // Wait for process button
  await page.locator('#process-btn').waitFor({ state: 'visible', timeout: 15000 });
  // Fill optional fields
  if (opts.password) {
    await page.locator('#tool-password').fill(opts.password);
  }
  if (opts.rotation) {
    await page.locator('#tool-rotation').selectOption(opts.rotation);
  }
  if (opts.range) {
    await page.locator('#tool-range').fill(opts.range);
  }
  if (opts.watermark) {
    await page.locator('#tool-watermark').fill(opts.watermark);
  }
  // Click process and get download
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: opts.timeout || 60000 }),
    page.locator('#process-btn').click()
  ]);
  const filename = download.suggestedFilename();
  await download.saveAs(path.join(DOWNLOAD_DIR, filename));
  return filename;
}

async function runTest(page, name, fn) {
  console.log(`\n=== ${name} ===`);
  try {
    const f = await fn();
    console.log(`PASS - Downloaded: ${f}`);
    return 'PASS';
  } catch (e) {
    console.log(`FAIL - ${e.message.split('\n')[0]}`);
    return 'FAIL';
  } finally {
    // Go back to home
    await page.evaluate(() => { window.location.hash = 'home'; });
    await page.waitForTimeout(300);
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const results = {};

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  console.log('Title:', await page.title());

  // Create minimal JPEG for jpg-to-pdf test
  const jpgBuf = Buffer.from([
    0xFF,0xD8,0xFF,0xE0,0x00,0x10,0x4A,0x46,0x49,0x46,0x00,0x01,0x01,0x00,0x00,0x01,
    0x00,0x01,0x00,0x00,0xFF,0xDB,0x00,0x43,0x00,0x08,0x06,0x06,0x07,0x06,0x05,0x08,
    0x07,0x07,0x07,0x09,0x09,0x08,0x0A,0x0C,0x14,0x0D,0x0C,0x0B,0x0B,0x0C,0x19,0x12,
    0x13,0x0F,0x14,0x1D,0x1A,0x1F,0x1E,0x1D,0x1A,0x1C,0x1C,0x20,0x24,0x2E,0x27,0x20,
    0x22,0x2C,0x23,0x1C,0x1C,0x28,0x37,0x29,0x2C,0x30,0x31,0x34,0x34,0x34,0x1F,0x27,
    0x39,0x3D,0x38,0x32,0x3C,0x2E,0x33,0x34,0x32,0xFF,0xC0,0x00,0x0B,0x08,0x00,0x01,
    0x00,0x01,0x01,0x01,0x11,0x00,0xFF,0xC4,0x00,0x1F,0x00,0x00,0x01,0x05,0x01,0x01,
    0x01,0x01,0x01,0x01,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x01,0x02,0x03,0x04,
    0x05,0x06,0x07,0x08,0x09,0x0A,0x0B,0xFF,0xC4,0x00,0xB5,0x10,0x00,0x02,0x01,0x03,
    0x03,0x02,0x04,0x03,0x05,0x05,0x04,0x04,0x00,0x00,0x01,0x7D,0x01,0x02,0x03,0x00,
    0x04,0x11,0x05,0x12,0x21,0x31,0x41,0x06,0x13,0x51,0x61,0x07,0x22,0x71,0x14,0x32,
    0x81,0x91,0xA1,0x08,0x23,0x42,0xB1,0xC1,0x15,0x52,0xD1,0xF0,0x24,0x33,0x62,0x72,
    0x82,0x09,0x0A,0x16,0x17,0x18,0x19,0x1A,0x25,0x26,0x27,0x28,0x29,0x2A,0x34,0x35,
    0x36,0x37,0x38,0x39,0x3A,0x43,0x44,0x45,0x46,0x47,0x48,0x49,0x4A,0x53,0x54,0x55,
    0x56,0x57,0x58,0x59,0x5A,0x63,0x64,0x65,0x66,0x67,0x68,0x69,0x6A,0x73,0x74,0x75,
    0x76,0x77,0x78,0x79,0x7A,0x83,0x84,0x85,0x86,0x87,0x88,0x89,0x8A,0x92,0x93,0x94,
    0x95,0x96,0x97,0x98,0x99,0x9A,0xA2,0xA3,0xA4,0xA5,0xA6,0xA7,0xA8,0xA9,0xAA,0xB2,
    0xB3,0xB4,0xB5,0xB6,0xB7,0xB8,0xB9,0xBA,0xC2,0xC3,0xC4,0xC5,0xC6,0xC7,0xC8,0xC9,
    0xCA,0xD2,0xD3,0xD4,0xD5,0xD6,0xD7,0xD8,0xD9,0xDA,0xE1,0xE2,0xE3,0xE4,0xE5,0xE6,
    0xE7,0xE8,0xE9,0xEA,0xF1,0xF2,0xF3,0xF4,0xF5,0xF6,0xF7,0xF8,0xF9,0xFA,0xFF,0xDA,
    0x00,0x08,0x01,0x01,0x00,0x00,0x3F,0x00,0x7B,0x94,0x11,0x00,0x00,0x00,0x00,0x00,
    0xFF,0xD9
  ]);
  const jpgPath = path.join(DOWNLOAD_DIR, 'test-image.jpg');
  fs.writeFileSync(jpgPath, jpgBuf);

  results['merge'] = await runTest(page, 'MERGE PDF', async () => {
    await goToTool(page, 'merge');
    return uploadAndProcess(page, [`${DIR}/test-sample.pdf`, `${DIR}/test-5pages.pdf`]);
  });

  results['split'] = await runTest(page, 'SPLIT PDF', async () => {
    await goToTool(page, 'split');
    return uploadAndProcess(page, `${DIR}/test-5pages.pdf`, { range: '1-3' });
  });

  results['compress'] = await runTest(page, 'COMPRESS PDF', async () => {
    await goToTool(page, 'compress');
    return uploadAndProcess(page, `${DIR}/test-sample.pdf`);
  });

  results['rotate'] = await runTest(page, 'ROTATE PDF', async () => {
    await goToTool(page, 'rotate');
    return uploadAndProcess(page, `${DIR}/test-sample.pdf`, { rotation: '90' });
  });

  results['delete'] = await runTest(page, 'DELETE PAGES', async () => {
    await goToTool(page, 'delete');
    return uploadAndProcess(page, `${DIR}/test-5pages.pdf`, { range: '2,4' });
  });

  results['watermark'] = await runTest(page, 'WATERMARK', async () => {
    await goToTool(page, 'watermark');
    return uploadAndProcess(page, `${DIR}/test-sample.pdf`, { watermark: 'CONFIDENTIAL' });
  });

  results['pdf-to-jpg'] = await runTest(page, 'PDF TO JPG', async () => {
    await goToTool(page, 'pdf-to-jpg');
    return uploadAndProcess(page, `${DIR}/test-sample.pdf`);
  });

  results['jpg-to-pdf'] = await runTest(page, 'JPG TO PDF', async () => {
    await goToTool(page, 'jpg-to-pdf');
    return uploadAndProcess(page, jpgPath);
  });

  results['protect-pdf'] = await runTest(page, 'PROTECT PDF', async () => {
    await goToTool(page, 'protect-pdf');
    return uploadAndProcess(page, `${DIR}/test-sample.pdf`, { password: 'test1234' });
  });

  results['unlock-pdf'] = await runTest(page, 'UNLOCK PDF', async () => {
    const pf = path.join(DOWNLOAD_DIR, 'test-sample_protected.pdf');
    if (!fs.existsSync(pf)) { console.log('SKIP'); return null; }
    await goToTool(page, 'unlock-pdf');
    return uploadAndProcess(page, pf, { password: 'test1234' });
  });

  results['pdf-to-word'] = await runTest(page, 'PDF TO WORD', async () => {
    await goToTool(page, 'pdf-to-word');
    return uploadAndProcess(page, `${DIR}/test-sample.pdf`, { timeout: 120000 });
  });

  console.log('\n========== RESULTS ==========');
  let allPass = true;
  for (const [tool, result] of Object.entries(results)) {
    const s = result || 'SKIP';
    if (s === 'FAIL') allPass = false;
    console.log(`  ${tool.padEnd(15)} ${s}`);
  }
  console.log(`\nOverall: ${allPass ? 'ALL PASSED' : 'SOME FAILURES'}`);

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
