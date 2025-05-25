const { Cluster } = require('puppeteer-cluster');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());
const { faker } = require('@faker-js/faker');

const MEETING_ID = '85082198955';
const PASSCODE = '0';
const TOTAL_USERS = 10;

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 5, // Reduced to avoid rate limiting
    puppeteer,
    puppeteerOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,720',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--blink-settings=imagesEnabled=true',
        '--disable-dev-shm-usage',
      ],
      executablePath: '/usr/bin/google-chrome',
    },
    timeout: 120000,
  });

  await cluster.task(async ({ page, data: name }) => {
    try {
      const joinUrl = `https://app.zoom.us/wc/join/${MEETING_ID}`;
      console.log(`[INFO] Navigating to ${joinUrl} for ${name}`);

      // Emulate a real browser
      await page.setViewport({ width: 1280, height: 720 });
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      });

      await page.goto(joinUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for the name input field with fallback selectors
      console.log(`[INFO] Waiting for name input for ${name}`);
      const nameSelector = '#input-for-name, input[name="userName"], input[placeholder*="name" i]';
      await page.waitForSelector(nameSelector, { timeout: 45000 });

      // Type the name
      await page.type(nameSelector, name);
      console.log(`[INFO] Typed name ${name}`);

      // Enter passcode if present
      const passField = await page.$('#input-for-pwd, input[name="password"]');
      if (passField) {
        await passField.type(PASSCODE);
        console.log(`[INFO] Typed passcode for ${name}`);
      }

      // Wait for page stabilization
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Click the skip mic/camera button if present
      const micSkip = await page.$('.continue-without-mic-camera, button[class*="skip" i]');
      if (micSkip) {
        await micSkip.click();
        console.log(`[INFO] Skipped mic/camera for ${name}`);
      }

      // Wait for and click the join button
      const joinButton = await page.waitForSelector('.zm-btn, button[class*="join" i]', { timeout: 15000 });
      await joinButton.click();
      console.log(`[✅] ${name} joined.`);

      // Keep session active
      await new Promise(resolve => setTimeout(resolve, 130000));
    } catch (err) {
      console.error(`[❌] ${name} failed: ${err.message}`);
      // Save screenshot and full page content
      await page.screenshot({ path: `error-${name.replace(/\s/g, '-')}-${Date.now()}.png`, fullPage: true });
      const content = await page.content();
      console.error(`[DEBUG] Page content for ${name}:\n${content.slice(0, 1000)}...`);
    }
  });

  // Queue users
  for (let i = 0; i < TOTAL_USERS; i++) {
    const fakeName = faker.person.fullName();
    cluster.queue(fakeName);
  }

  await cluster.idle();
  await cluster.close();
})();