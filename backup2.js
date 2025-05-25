const { Cluster } = require('puppeteer-cluster');
const { faker } = require('@faker-js/faker');

const CONFIG = {
  MEETING_ID: '82438769057',
  PASSCODE: '0',
  TOTAL_USERS: 100,
  CONCURRENCY: 10,
  PUPPETEER_OPTS: {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--blink-settings=imagesEnabled=false',
      '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding'
    ],
    defaultViewport: { width: 800, height: 600 },
    timeout: 60000
  },
  RETRY_LIMIT: 2,
  RETRY_DELAY: 3000,
  JOIN_TIMEOUT: 30000,
  SELECTOR_TIMEOUT: 10000,
  JOIN_CONFIRM_TIMEOUT: 20000,
  STAY_DURATION: 60000,
  BATCH_SIZE: 10
};

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: CONFIG.CONCURRENCY,
    puppeteerOptions: CONFIG.PUPPETEER_OPTS,
    retryLimit: CONFIG.RETRY_LIMIT,
    retryDelay: CONFIG.RETRY_DELAY,
    monitor: false
  });

  cluster.on('taskerror', (err, data) => console.error(`[❌] ${data} failed: ${err.message}`));

  cluster.task(async ({ page, data: name }) => {
    await page.goto(`https://app.zoom.us/wc/join/${CONFIG.MEETING_ID}?_x_zm_rtaid=`, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.JOIN_TIMEOUT
    });

    await Promise.all([
      page.waitForSelector('#input-for-name', { timeout: CONFIG.SELECTOR_TIMEOUT })
        .then(el => el.type(name, { delay: 50 })),
      page.waitForSelector('#input-for-pwd', { timeout: CONFIG.SELECTOR_TIMEOUT })
        .then(el => el?.type(CONFIG.PASSCODE)),
      page.waitForSelector('.continue-without-mic-camera', { timeout: CONFIG.SELECTOR_TIMEOUT })
        .then(el => el?.click())
    ]);

    await Promise.all([
      page.click('.zm-btn', { timeout: CONFIG.SELECTOR_TIMEOUT }),
      page.waitForSelector('.meeting-client', { timeout: CONFIG.JOIN_CONFIRM_TIMEOUT })
    ]);

    console.log(`[✅] ${name} joined`);
    await page.waitForTimeout(CONFIG.STAY_DURATION);
  });

  const queueBatch = async (start, end) => {
    const batch = Array.from({ length: Math.min(end - start, CONFIG.BATCH_SIZE) }, () => faker.person.fullName());
    await Promise.all(batch.map(name => cluster.queue(name)));
  };

  for (let i = 0; i < CONFIG.TOTAL_USERS; i += CONFIG.BATCH_SIZE) {
    await queueBatch(i, i + CONFIG.BATCH_SIZE);
    if (i + CONFIG.BATCH_SIZE < CONFIG.TOTAL_USERS) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
    }
  }

  await cluster.idle();
  await cluster.close();
})();