import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:9090';
const __dirname = 'C:/Users/capy1/Desktop/front end2';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => console.log(`  [${msg.type()}] ${msg.text()}`));
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

  console.log('=== DEBUG: PDF-TO-JPG ===');
  await page.goto(`${BASE_URL}#tool?id=pdf-to-jpg`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Check current tool
  const toolCheck = await page.evaluate(() => {
    return {
      currentToolId: typeof currentTool !== 'undefined' ? currentTool?.id : 'undef',
      selectedFilesLen: typeof selectedFiles !== 'undefined' ? selectedFiles.length : 'undef'
    };
  });
  console.log('Before upload:', toolCheck);

  // Upload file
  await page.locator('#file-input').setInputFiles(`${__dirname}/test-sample.pdf`);
  await page.waitForTimeout(3000);

  const afterUpload = await page.evaluate(() => {
    return {
      currentToolId: typeof currentTool !== 'undefined' ? currentTool?.id : 'undef',
      selectedFilesLen: typeof selectedFiles !== 'undefined' ? selectedFiles.length : 'undef',
      processBtnHidden: document.getElementById('process-btn')?.classList.contains('hidden'),
      dropzoneHidden: document.getElementById('file-dropzone')?.classList.contains('hidden'),
      fileListHidden: document.getElementById('file-list')?.classList.contains('hidden'),
      fileListHTML: document.getElementById('file-list')?.innerHTML?.substring(0, 200),
      gridHidden: document.getElementById('page-preview-grid')?.classList.contains('hidden'),
      gridHTML: document.getElementById('page-preview-grid')?.innerHTML?.substring(0, 200)
    };
  });
  console.log('After upload:', afterUpload);

  console.log('\n=== DEBUG: ROTATE ===');
  await page.goto(`${BASE_URL}#tool?id=rotate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  await page.locator('#file-input').setInputFiles(`${__dirname}/test-sample.pdf`);
  await page.waitForTimeout(3000);

  const afterUploadRotate = await page.evaluate(() => {
    return {
      currentToolId: typeof currentTool !== 'undefined' ? currentTool?.id : 'undef',
      selectedFilesLen: typeof selectedFiles !== 'undefined' ? selectedFiles.length : 'undef',
      processBtnHidden: document.getElementById('process-btn')?.classList.contains('hidden'),
      dropzoneHidden: document.getElementById('file-dropzone')?.classList.contains('hidden'),
      fileListHidden: document.getElementById('file-list')?.classList.contains('hidden'),
    };
  });
  console.log('After upload:', afterUploadRotate);

  // Try clicking process
  const btnVisible = await page.locator('#process-btn').isVisible();
  console.log('Process btn visible:', btnVisible);
  if (btnVisible) {
    await page.locator('#process-btn').click();
    await page.waitForTimeout(5000);
    const loadingVisible = await page.locator('#loading-indicator').isVisible();
    console.log('Loading visible after click:', loadingVisible);
  }

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
