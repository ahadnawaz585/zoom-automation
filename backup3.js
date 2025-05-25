const { Cluster } = require('puppeteer-cluster');
const { faker } = require('@faker-js/faker');

const CONFIG = {
  MEETING_ID : '85082198955',     // Example: 88621666382
 PASSCODE : '0',
  TOTAL_USERS: 100,
  CONCURRENCY: 5, // Reduced for lower resource usage
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
      '--disable-renderer-backgrounding',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-client-side-phishing-detection',
      '--disable-background-networking'
    ],
    defaultViewport: { width: 800, height: 600 },
    timeout: 60000,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH // Use system browser if available
  },
  RETRY_LIMIT: 3, // Slightly increased for reliability
  RETRY_DELAY: () => Math.random() * 2000 + 1000, // Randomized delay (1-3s)
  JOIN_TIMEOUT: 30000,
  SELECTOR_TIMEOUT: 10000,
  JOIN_CONFIRM_TIMEOUT: 20000,
  STAY_DURATION: 60000,
  BATCH_SIZE: 5, // Reduced for less simultaneous load
  MAX_PAGE_REUSE: 5 // Reuse pages to reduce memory overhead
};

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_BROWSER, // Use browser instances for better isolation
    maxConcurrency: CONFIG.CONCURRENCY,
    puppeteerOptions: CONFIG.PUPPETEER_OPTS,
    retryLimit: CONFIG.RETRY_LIMIT,
    retryDelay: CONFIG.RETRY_DELAY(),
    monitor: false,
    workerCreationDelay: 500 // Stagger worker creation
  });

  cluster.on('taskerror', (err, data) => {
    console.error(`[❌] ${data} failed: ${err.message}`);
  });

  const pageCache = new Map(); // Cache for page reuse

  cluster.task(async ({ page, data: { name, reuseCount = 0 } }) => {
    try {
      // Optimize page by disabling unnecessary features
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Set lightweight user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

      await page.goto(`https://app.zoom.us/wc/join/${CONFIG.MEETING_ID}?_x_zm_rtaid=`, {
        waitUntil: 'domcontentloaded', // Faster than networkidle0
        timeout: CONFIG.JOIN_TIMEOUT
      });

      // Parallelize input actions with error handling
      await Promise.all([
        page.waitForSelector('#input-for-name', { timeout: CONFIG.SELECTOR_TIMEOUT })
          .then(el => el?.type(name, { delay: 50 }))
          .catch(() => console.warn(`[⚠️] Name input failed for ${name}`)),
        page.waitForSelector('#input-for-pwd', { timeout: CONFIG.SELECTOR_TIMEOUT })
          .then(el => el?.type(CONFIG.PASSCODE))
          .catch(() => console.warn(`[⚠️] Passcode input failed for ${name}`)),
        page.waitForSelector('.continue-without-mic-camera', { timeout: CONFIG.SELECTOR_TIMEOUT })
          .then(el => el?.click())
          .catch(() => console.warn(`[⚠️] Mic/camera skip failed for ${name}`))
      ]);

      await Promise.all([
        page.click('.zm-btn', { timeout: CONFIG.SELECTOR_TIMEOUT })
          .catch(() => console.warn(`[⚠️] Join button click failed for ${name}`)),
        page.waitForSelector('.meeting-client', { timeout: CONFIG.JOIN_CONFIRM_TIMEOUT })
          .catch(() => console.warn(`[⚠️] Meeting client load failed for ${name}`))
      ]);

      console.log(`[✅] ${name} joined`);

      // Randomize stay duration slightly to avoid synchronized exits
      await page.waitForTimeout(CONFIG.STAY_DURATION + Math.random() * 5000);

      // Reuse page if within limit
      if (reuseCount < CONFIG.MAX_PAGE_REUSE) {
        pageCache.set(name, { page, reuseCount: reuseCount + 1 });
      }
    } catch (error) {
      console.error(`[❌] Task failed for ${name}: ${error.message}`);
      throw error; // Let cluster handle retry
    }
  });

  const queueBatch = async (start, end) => {
    const batch = Array.from({ length: Math.min(end - start, CONFIG.BATCH_SIZE) }, () => ({
      name: faker.person.fullName(),
      reuseCount: 0
    }));

    for (const user of batch) {
      // Check for reusable page
      const cached = pageCache.get(user.name);
      if (cached && cached.reuseCount < CONFIG.MAX_PAGE_REUSE) {
        user.reuseCount = cached.reuseCount;
        await cluster.queue({ ...user, page: cached.page });
        pageCache.delete(user.name);
      } else {
        await cluster.queue(user);
      }
      // Random delay between tasks to avoid spikes
      await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 100));
    }
  };

  for (let i = 0; i < CONFIG.TOTAL_USERS; i += CONFIG.BATCH_SIZE) {
    await queueBatch(i, i + CONFIG.BATCH_SIZE);
    if (i + CONFIG.BATCH_SIZE < CONFIG.TOTAL_USERS) {
      await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY()));
    }
  }

  await cluster.idle();
  await cluster.close();
})();