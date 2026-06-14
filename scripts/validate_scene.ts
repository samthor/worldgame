import puppeteer from 'puppeteer';
import { spawn } from 'child_process';

async function validate() {
  console.log('Starting Vite server...');
  const vite = spawn('pnpm', ['exec', 'vite', '--port', '5173'], {
    shell: true,
  });

  let viteStarted = false;
  vite.stdout.on('data', (data) => {
    if (data.toString().includes('Local:')) {
      viteStarted = true;
    }
  });

  // Wait for vite to start
  for (let i = 0; i < 10; i++) {
    if (viteStarted) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  if (!viteStarted) {
    console.error('Vite failed to start');
    vite.kill();
    process.exit(1);
  }

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.log('BROWSER ERROR:', msg.text());
    } else {
      console.log('BROWSER LOG:', msg.text());
    }
  });

  try {
    await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' });
    
    // Wait for the "Topological Generation Complete" text to appear
    console.log('Waiting for generation to complete...');
    await page.waitForFunction(
      () => document.getElementById('info')?.innerText.includes('Complete'),
      { timeout: 30000 }
    );

    console.log('Generation complete. Taking screenshot...');
    await page.screenshot({ path: 'validation-screenshot.png' });

    if (consoleErrors.length > 0) {
      console.error(`Validation failed with ${consoleErrors.length} errors.`);
      process.exit(1);
    } else {
      console.log('Validation successful!');
    }
  } catch (err) {
    console.error('Validation crashed:', err);
    process.exit(1);
  } finally {
    await browser.close();
    vite.kill();
  }
}

validate();
