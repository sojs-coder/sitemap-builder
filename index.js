const express = require('express');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const app = express();
const port = 3000;

app.get('/crawl/:url', async (req, res) => {
  const url = req.params.url;

  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle0' });

    console.log(`page scanned: ${await page.title()}`);

    const $ = await cheerio.load(await page.content());
    const links = $('a').map((i, link) => $(link).attr('href')).get();

    const sitemap = new Set();

    for (const link of links) {
      if (link.startsWith('/') || link.startsWith(url)) {
        console.log(`link found: ${link}`);
        sitemap.add(link);

        await page.goto(link, { waitUntil: 'networkidle0' });
        console.log(`page scanned: ${await page.title()}`);
      }
    }

    await browser.close();

    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...sitemap].map(link => `  <url>
    <loc>${link}</loc>
  </url>`).join('\n')}
</urlset>`);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error crawling the website');
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
