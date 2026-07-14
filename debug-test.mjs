import { chromium } from '@playwright/test';

const BASE_URL = 'http://localhost:9090';
const __dirname = 'C:/Users/capy1/Desktop/front end2';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.log(`  [${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', e => console.log(`  [pageerror] ${e.message}`));

  console.log('=== DEBUG: ROTATE ===');
  await page.goto(`${BASE_URL}#tool?id=rotate`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  
  // Check if view is visible
  const viewVisible = await page.locator('#view-tool-detail').isVisible();
  console.log('view-tool-detail visible:', viewVisible);
  
  // Check process-btn
  const btnHidden = await page.locator('#process-btn').evaluate(el => el.classList.contains('hidden'));
  console.log('process-btn hidden:', btnHidden);

  // Upload file
  await page.locator('#file-input').setInputFiles(`${__dirname}/test-sample.pdf`);
  console.log('File uploaded, waiting...');
  await page.waitForTimeout(3000);

  // Check state again
  const btnHidden2 = await page.locator('#process-btn').evaluate(el => el.classList.contains('hidden'));
  console.log('process-btn hidden after upload:', btnHidden2);
  
  const dropzoneHidden = await page.locator('#file-dropzone').evaluate(el => el.classList.contains('hidden'));
  console.log('dropzone hidden after upload:', dropzoneHidden);
  
  const fileListVisible = await page.locator('#file-list').isVisible();
  console.log('file-list visible:', fileListVisible);

  // Check if selectedFiles is populated
  const selectedFilesLen = await page.evaluate(() => window.selectedFiles?.length);
  console.log('selectedFiles.length:', selectedFilesLen);

  // Check if currentTool is set
  const currentToolId = await page.evaluate(() => window.currentTool?.id);
  console.log('currentTool.id:', currentToolId);

  // Check if pdfjsLib is loaded
  const pdfjsLoaded = await page.evaluate(() => typeof window.pdfjsLib !== 'undefined');
  console.log('pdfjsLib loaded:', pdfjsLoaded);

  // Check process-btn again
  const btnVisible = await page.locator('#process-btn').isVisible();
  console.log('process-btn isVisible:', btnVisible);

  console.log('\n=== DEBUG: PDF-TO-JPG ===');
  await page.goto(`${BASE_URL}#tool?id=pdf-to-jpg`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const viewVisible2 = await page.locator('#view-tool-detail').isVisible();
  console.log('view-tool-detail visible:', viewVisible2);

  await page.locator('#file-input').setInputFiles(`${__dirname}/test-sample.pdf`);
  console.log('File uploaded, waiting...');
  await page.waitForTimeout(3000);

  const btnHidden3 = await page.locator('#process-btn').evaluate(el => el.classList.contains('hidden'));
  console.log('process-btn hidden after upload:', btnHidden3);

  const selectedFilesLen2 = await page.evaluate(() => window.selectedFiles?.length);
  console.log('selectedFiles.length:', selectedFilesLen2);

  const btnVisible2 = await page.locator('#process-btn').isVisible();
  console.log('process-btn isVisible:', btnVisible2);

  await browser.close();
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
