const { Cluster } = require('puppeteer-cluster');
const { faker } = require('@faker-js/faker');

const CONFIG = {
  MEETING_ID: '82438769057',
  PASSCODE: '0',
  TOTAL_USERS: 100,
  CONCURRENCY: 20,
  PUPPETEER_OPTS: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--blink-settings=imagesEnabled=false'
    ],
    defaultViewport: { width: 1280, height: 720 },
    timeout: 120000
  },
  RETRY_LIMIT: 2,
  RETRY_DELAY: 5000,
  JOIN_TIMEOUT: 60000,
  SELECTOR_TIMEOUT: 15000,
  JOIN_CONFIRM_TIMEOUT: 30000,
  STAY_DURATION: 120000,
  BATCH_DELAY: 5000
};

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER,
    maxConcurrency: CONFIG.CONCURRENCY,
    puppeteerOptions: CONFIG.PUPPETEER_OPTS,
    retryLimit: CONFIG.RETRY_LIMIT,
    retryDelay: CONFIG.RETRY_DELAY
  });

  cluster.task(async ({ page, data: name }) => {
    try {
      await page.goto(`https://app.zoom.us/wc/join/${CONFIG.MEETING_ID}`, { waitUntil: 'domcontentloaded', timeout: CONFIG.JOIN_TIMEOUT });
      await page.waitForSelector('#input-for-name', { timeout: CONFIG.SELECTOR_TIMEOUT });
      await page.type('#input-for-name', name);

      const passField = await page.$('#input-for-pwd');
      if (passField) await passField.type(CONFIG.PASSCODE);

      await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

      const micSkip = await page.$('.continue-without-mic-camera');
      if (micSkip) await micSkip.click();

      await (await page.waitForSelector('.zm-btn', { timeout: CONFIG.SELECTOR_TIMEOUT })).click();
      await page.waitForSelector('.meeting-client', { timeout: CONFIG.JOIN_CONFIRM_TIMEOUT });

      console.log(`[✅] ${name} joined`);
      await new Promise(resolve => setTimeout(resolve, CONFIG.STAY_DURATION));
    } catch (err) {
      console.error(`[❌] ${name} failed: ${err.message}`);
    }
  });

  for (let i = 0; i < CONFIG.TOTAL_USERS; i++) {
    cluster.queue(faker.person.fullName());
    if ((i + 1) % CONFIG.CONCURRENCY === 0) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.BATCH_DELAY));
    }
  }

  await cluster.idle();
  await cluster.close();
})();