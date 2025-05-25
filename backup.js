const { Cluster } = require('puppeteer-cluster');
const { faker } = require('@faker-js/faker');

const MEETING_ID = '85082198955';      // Example: 88621666382
const PASSCODE = 'VusTX7';          // Example: hqnjt1
const TOTAL_USERS = 10;                    // You can set to 100

(async () => {
  const cluster = await Cluster.launch({
    concurrency: Cluster.CONCURRENCY_CONTEXT,
    maxConcurrency: 10,
    puppeteerOptions: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--window-size=1280,720'
      ]
    },
    timeout: 120000
  });

  await cluster.task(async ({ page, data: name }) => {
    try {
      const joinUrl = `https://app.zoom.us/wc/join/${MEETING_ID}`;
      await page.goto(joinUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });

      await page.waitForSelector('#input-for-name', { timeout: 15000 });
      await page.type('#input-for-name', name);

      const passField = await page.$('#input-for-pwd');
      if (passField) {
        await passField.type(PASSCODE);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
;

      const micSkip = await page.$('.continue-without-mic-camera');
      if (micSkip) await micSkip.click();
      micSkip.click();

      await new Promise(resolve => setTimeout(resolve, 3000));
;

      const joinButton = await page.waitForSelector('.zm-btn', { timeout: 10000 });
      await joinButton.click();


      console.log(`[✅] ${name} joined.`);
      
      await new Promise(resolve => setTimeout(resolve, 130000));


    } catch (err) {
      console.error(`[❌] ${name} failed: ${err.message}`);
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
