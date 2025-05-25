const { Cluster } = require('puppeteer-cluster');
const { faker } = require('@faker-js/faker');

const MEETING_ID = '85082198955';
const PASSCODE = '0';
const TOTAL_USERS = 10;

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 10,
    puppeteerOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,720',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
      ],
      executablePath: '/usr/bin/google-chrome', // Ensure Chrome is installed on AWS
    },
    timeout: 120000,
  });

  await cluster.task(async ({ page, data: name }) => {
    try {
      const joinUrl = `https://app.zoom.us/wc/join/${MEETING_ID}`;
      console.log(`[INFO] Navigating to ${joinUrl} for ${name}`);
      await page.goto(joinUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for the name input field
      console.log(`[INFO] Waiting for #input-for-name for ${name}`);
      await page.waitForSelector('#input-for-name', { timeout: 30000 });

      // Type the name
      await page.type('#input-for-name', name);
      console.log(`[INFO] Typed name ${name}`);

      // Enter passcode if present
      const passField = await page.$('#input-for-pwd');
      if (passField) {
        await passField.type(PASSCODE);
        console.log(`[INFO] Typed passcode for ${name}`);
      }

      // Wait for a moment to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Click the skip mic/camera button if present
      const micSkip = await page.$('.continue-without-mic-camera');
      if (micSkip) {
        await micSkip.click();
        console.log(`[INFO] Skipped mic/camera for ${name}`);
      }

      // Wait for and click the join button
      const joinButton = await page.waitForSelector('.zm-btn', { timeout: 10000 });
      await joinButton.click();
      console.log(`[✅] ${name} joined.`);

      // Keep the session active for 130 seconds
      await new Promise(resolve => setTimeout(resolve, 130000));
    } catch (err) {
      console.error(`[❌] ${name} failed: ${err.message}`);
      // Save a screenshot for debugging
      await page.screenshot({ path: `error-${name.replace(/\s/g, '-')}.png` });
      // Log page content for inspection
      const content = await page.content();
      console.error(`[DEBUG] Page content for ${name}:\n${content.slice(0, 500)}...`);
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