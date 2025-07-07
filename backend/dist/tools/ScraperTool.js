"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperTool = void 0;
const playwright_1 = require("playwright");
const jsdom_1 = require("jsdom");
const readability_1 = require("@mozilla/readability");
class ScraperTool {
    constructor(config = {}) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'web_scraper'
        });
        Object.defineProperty(this, "description", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Extract clean text content from web pages with browser pooling and batch processing'
        });
        Object.defineProperty(this, "timeout", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "userAgent", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "maxConcurrency", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "poolSize", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "retryAttempts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "delay", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "browserPool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        Object.defineProperty(this, "isInitialized", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: false
        });
        Object.defineProperty(this, "activeRequests", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        this.timeout = config.timeout || 30000;
        this.userAgent = config.userAgent || 'AI Research Agent/1.0';
        this.maxConcurrency = config.maxConcurrency || 3;
        this.poolSize = config.poolSize || 2;
        this.retryAttempts = config.retryAttempts || 3;
        this.delay = config.delay || 1000;
    }
    async execute(input) {
        const { url, waitForSelector, extractImages = false, extractLinks = false, customSelectors = {} } = input;
        if (!await this.validateUrl(url)) {
            throw new Error(`Invalid URL: ${url}`);
        }
        await this.initializeBrowserPool();
        let attempt = 0;
        while (attempt < this.retryAttempts) {
            try {
                const browserInstance = await this.getBrowserInstance();
                try {
                    const result = await this.scrapeWithBrowser(browserInstance, {
                        url,
                        waitForSelector,
                        extractImages,
                        extractLinks,
                        customSelectors,
                    });
                    this.releaseBrowserInstance(browserInstance);
                    return result;
                }
                catch (error) {
                    this.releaseBrowserInstance(browserInstance);
                    throw error;
                }
            }
            catch (error) {
                attempt++;
                if (attempt >= this.retryAttempts) {
                    console.error(`Failed to scrape ${url} after ${this.retryAttempts} attempts:`, error);
                    return this.createFallbackResult(url, error);
                }
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * this.delay));
            }
        }
        return this.createFallbackResult(url, new Error('Max retry attempts reached'));
    }
    async scrapeWithBrowser(browserInstance, options) {
        const page = await browserInstance.context.newPage();
        const startTime = Date.now();
        try {
            await page.setViewportSize({ width: 1920, height: 1080 });
            await page.goto(options.url, {
                timeout: Math.min(this.timeout, 15000),
                waitUntil: 'domcontentloaded',
            });
            if (options.waitForSelector) {
                try {
                    await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
                }
                catch (error) {
                    console.warn(`Selector ${options.waitForSelector} not found, continuing anyway`);
                }
            }
            const html = await page.content();
            const dom = new jsdom_1.JSDOM(html, { url: options.url });
            const reader = new readability_1.Readability(dom.window.document);
            const article = reader.parse();
            let title = 'Untitled';
            let content = '';
            let metadata = {};
            if (article) {
                title = article.title || 'Untitled';
                content = article.textContent || '';
                metadata = {
                    author: article.byline || undefined,
                    publishedDate: article.publishedTime || undefined,
                    description: dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
                };
            }
            else {
                title = dom.window.document.title || 'Untitled';
                const bodyText = dom.window.document.body?.textContent || '';
                content = bodyText.replace(/\s+/g, ' ').trim().substring(0, 5000);
                metadata = {
                    author: dom.window.document.querySelector('meta[name="author"]')?.getAttribute('content') || undefined,
                    publishedDate: dom.window.document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || undefined,
                    description: dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
                };
            }
            if (options.extractImages) {
                const images = await page.$$eval('img', imgs => imgs.map(img => ({
                    src: img.src,
                    alt: img.alt,
                    title: img.title,
                })).filter(img => img.src && img.src.startsWith('http')));
                metadata.images = images;
            }
            if (options.extractLinks) {
                const links = await page.$$eval('a', links => links.map(link => ({
                    href: link.href,
                    text: link.textContent?.trim(),
                    title: link.title,
                })).filter(link => link.href && link.href.startsWith('http')));
                metadata.links = links;
            }
            for (const [key, selector] of Object.entries(options.customSelectors)) {
                try {
                    const element = await page.$(selector);
                    if (element) {
                        metadata[key] = await element.textContent();
                    }
                }
                catch (error) {
                    console.warn(`Failed to extract custom selector ${key}: ${selector}`, error);
                }
            }
            metadata.extractionTime = Date.now() - startTime;
            metadata.pageLoadTime = await page.evaluate(() => performance.now());
            return {
                url: options.url,
                title,
                content: content || `Content from ${options.url}`,
                metadata,
                extractedAt: new Date(),
                contentLength: content.length,
                success: true,
            };
        }
        finally {
            await page.close();
        }
    }
    async initializeBrowserPool() {
        if (this.isInitialized)
            return;
        for (let i = 0; i < this.poolSize; i++) {
            const browser = await playwright_1.chromium.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                ],
            });
            const context = await browser.newContext({
                userAgent: this.userAgent,
                viewport: { width: 1920, height: 1080 },
            });
            this.browserPool.push({
                browser,
                context,
                inUse: false,
                lastUsed: new Date(),
            });
        }
        this.isInitialized = true;
    }
    async getBrowserInstance() {
        while (this.activeRequests >= this.maxConcurrency) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        const availableInstance = this.browserPool.find(instance => !instance.inUse);
        if (!availableInstance) {
            await new Promise(resolve => setTimeout(resolve, 100));
            return this.getBrowserInstance();
        }
        availableInstance.inUse = true;
        availableInstance.lastUsed = new Date();
        this.activeRequests++;
        return availableInstance;
    }
    releaseBrowserInstance(instance) {
        instance.inUse = false;
        instance.lastUsed = new Date();
        this.activeRequests--;
    }
    async scrapeMultipleUrls(urls, options = {}) {
        const { concurrency = this.maxConcurrency, delay = this.delay, extractImages = false, extractLinks = false, customSelectors = {} } = options;
        const results = [];
        for (let i = 0; i < urls.length; i += concurrency) {
            const batch = urls.slice(i, i + concurrency);
            const batchPromises = batch.map(async (url, index) => {
                await new Promise(resolve => setTimeout(resolve, index * delay));
                try {
                    return await this.execute({
                        url,
                        extractImages,
                        extractLinks,
                        customSelectors
                    });
                }
                catch (error) {
                    console.error(`Failed to scrape ${url}:`, error);
                    return this.createFallbackResult(url, error);
                }
            });
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
        }
        return results;
    }
    async validateUrl(url) {
        try {
            const urlObj = new URL(url);
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                return false;
            }
            const suspiciousPatterns = [
                /javascript:/i,
                /data:/i,
                /file:/i,
                /ftp:/i,
            ];
            return !suspiciousPatterns.some(pattern => pattern.test(url));
        }
        catch {
            return false;
        }
    }
    async getPageTitle(url) {
        try {
            const result = await this.execute({ url });
            return result.title;
        }
        catch (error) {
            console.error(`Failed to get page title for ${url}:`, error);
            return null;
        }
    }
    async extractSpecificContent(url, selectors) {
        try {
            const result = await this.execute({ url, customSelectors: selectors });
            const extracted = {};
            for (const key of Object.keys(selectors)) {
                extracted[key] = result.metadata[key] || '';
            }
            return extracted;
        }
        catch (error) {
            console.error(`Failed to extract specific content from ${url}:`, error);
            return {};
        }
    }
    async batchExtract(requests) {
        const results = [];
        for (const request of requests) {
            try {
                const result = await this.execute({
                    url: request.url,
                    customSelectors: request.selectors || {},
                    waitForSelector: request.waitForSelector,
                });
                results.push(result);
            }
            catch (error) {
                console.error(`Batch extract failed for ${request.url}:`, error);
                results.push(this.createFallbackResult(request.url, error));
            }
        }
        return results;
    }
    createFallbackResult(url, error) {
        return {
            url,
            title: `Failed to extract: ${url}`,
            content: `Unable to extract content from ${url}. Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            metadata: {
                error: error instanceof Error ? error.message : 'Unknown error',
            },
            extractedAt: new Date(),
            contentLength: 0,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        };
    }
    async getPoolStats() {
        return {
            poolSize: this.browserPool.length,
            activeRequests: this.activeRequests,
            availableInstances: this.browserPool.filter(instance => !instance.inUse).length,
            totalRequests: this.browserPool.reduce((sum, instance) => sum + (instance.inUse ? 1 : 0), 0),
        };
    }
    async close() {
        for (const instance of this.browserPool) {
            try {
                await instance.context.close();
                await instance.browser.close();
            }
            catch (error) {
                console.error('Error closing browser instance:', error);
            }
        }
        this.browserPool = [];
        this.isInitialized = false;
        this.activeRequests = 0;
    }
    async health() {
        try {
            if (!this.isInitialized) {
                await this.initializeBrowserPool();
            }
            const testResult = await this.execute({ url: 'https://httpbin.org/html' });
            return testResult.success;
        }
        catch (error) {
            console.error('Health check failed:', error);
            return false;
        }
    }
}
exports.ScraperTool = ScraperTool;
//# sourceMappingURL=ScraperTool.js.map