const puppeteer = require('puppeteer');
const { spawn } = require('child_process');

async function validate() {
  console.log('Starting Vite server...');
  const vite = spawn('pnpm', ['exec', 'vite', '--port', '5173'], {
    shell: true,
  });

  let viteStarted = false;
  let port = 5173;
  vite.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('VITE:', output);
    if (output.includes('Local:')) {
      viteStarted = true;
      const match = output.match(/http:\/\/localhost:(\d+)\//);
      if (match) port = match[1];
    }
  });

  vite.stderr.on('data', (data) => {
    console.error('VITE ERROR:', data.toString());
  });

  // Wait for vite to start
  for (let i = 0; i < 15; i++) {
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
      const text = msg.text();
      if (text.includes('favicon.ico') || text.includes('Failed to load resource')) return;
      consoleErrors.push(text);
      console.log('BROWSER ERROR:', text);
    } else {
      console.log('BROWSER LOG:', msg.text());
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.message);
    console.log('PAGE ERROR:', err.message);
  });

  page.on('requestfailed', request => {
    console.log(`REQUEST FAILED: ${request.url()} - ${request.failure().errorText}`);
    consoleErrors.push(`${request.url()} - ${request.failure().errorText}`);
  });

  page.on('response', response => {
    if (response.status() >= 400 && !response.url().endsWith('favicon.ico')) {
      console.log(`HTTP ERROR: ${response.status()} ${response.url()}`);
      consoleErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  try {
    console.log(`Navigating to http://localhost:${port}...`);
    await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle0' });
    
    // Wait for the "Topological Generation Complete" text to appear
    console.log('Waiting for generation to complete...');
    await page.waitForFunction(
      () => {
        const info = document.getElementById('info');
        return info && info.innerText.includes('Complete');
      },
      { timeout: 45000 }
    );

    console.log('Generation complete. Taking screenshot...');
    await page.screenshot({ path: 'validation-screenshot.png' });

    if (consoleErrors.length > 0) {
      console.error(`Validation failed with ${consoleErrors.length} errors.`);
      // We might want to see the screenshot anyway
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
