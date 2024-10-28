const express = require('express');
const { JSDOM } = require('jsdom');
const { URL } = require('url');
const fetch = require("node-fetch");
const app = express();
const port = 3000;
const fs = require("fs")

// Helper function to resolve relative URLs
function resolveUrl(baseUrl, relativePath) {
    try {
        // Ignore javascript: protocol and other invalid URLs
        if (relativePath.startsWith('javascript:') ||
            relativePath.startsWith('mailto:') ||
            relativePath.startsWith('#') ||
            relativePath.trim() === '') {
            return null;
        }

        // Handle cases where the URL is already absolute
        if (relativePath.startsWith('http')) {
            return relativePath;
        }

        const base = new URL(baseUrl);
        // Handle relative paths that start with '/'
        if (relativePath.startsWith('/')) {
            return `${base.protocol}//${base.host}${relativePath}`;
        }
        // Handle relative paths without leading '/'
        return `${base.protocol}//${base.host}/${relativePath}`;
    } catch (error) {
        console.error('Error resolving URL:', error);
        return null;
    }
}

async function crawlPage(url, baseUrl) {
    try {
        // Fetch the page content
        const response = await fetch(url);
        const html = await response.text();

        // Configure JSDOM to execute scripts and allow external requests
        const dom = new JSDOM(html, {
            url: url,
            referrer: url,
            contentType: "text/html",
            includeNodeLocations: true,
            storageQuota: 10000000,
            runScripts: "dangerously",
            resources: "usable",
            pretendToBeVisual: true,
            virtualConsole: new (require('jsdom').VirtualConsole)()
        });
        const fetchPkg = 'node_modules/whatwg-fetch/dist/fetch.umd.js';
        dom.window.eval(fs.readFileSync(fetchPkg, 'utf-8'));
        // Wait for any dynamic content to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        const links = Array.from(dom.window.document.querySelectorAll('a'))
            .map(link => link.href)
            .filter(link => {
                try {
                    const linkUrl = new URL(link);
                    return linkUrl.host === baseUrl.host;
                } catch {
                    return false;
                }
            });

        return {
            title: dom.window.document.title,
            links: [...new Set(links)] // Remove duplicates
        };

    } catch (error) {
        console.error(`Error crawling ${url}:`, error);
        return { title: '', links: [] };
    }
}

app.get('/crawl', async (req, res) => {
    const url = req.query.url;

    if (!url) {
        return res.status(400).send('URL parameter is required');
    }

    try {
        const baseUrl = new URL(url);
        const processedUrls = new Set();
        const urlsToProcess = new Set([url]);

        // Set up streaming response
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.write('<?xml version="1.0" encoding="UTF-8"?>\n');
        res.write('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');

        // Keep connection alive
        const keepAlive = setInterval(() => {
            res.write('<!-- keeping connection alive -->\n');
        }, 30000);

        while (urlsToProcess.size > 0) {
            const currentUrl = urlsToProcess.values().next().value;
            urlsToProcess.delete(currentUrl);

            if (!processedUrls.has(currentUrl)) {
                processedUrls.add(currentUrl);

                const { title, links } = await crawlPage(currentUrl, baseUrl);
                console.log(`Page scanned: ${title || currentUrl}`);

                // Write URL to sitemap immediately
                res.write(`  <url>\n    <loc>${currentUrl}</loc>\n  </url>\n`);

                // Add new links to processing queue
                for (const link of links) {
                    const resolvedUrl = resolveUrl(url, link);
                    if (resolvedUrl && !processedUrls.has(resolvedUrl)) {
                        console.log(`Link found: ${resolvedUrl}`);
                        urlsToProcess.add(resolvedUrl);
                    }
                }
            }
        }

        clearInterval(keepAlive);
        res.write('</urlset>');
        res.end();

    } catch (error) {
        console.error('Crawl error:', error);
        clearInterval(keepAlive);
        res.status(500).send('Error crawling the website');
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});