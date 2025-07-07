import { Tool } from '../types';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';

interface ScrapedContent {
  url: string;
  title: string;
  content: string;
  metadata: {
    author?: string | undefined;
    publishedDate?: string | undefined;
    description?: string | undefined;
    [key: string]: any;
  };
  extractedAt: Date;
  contentLength: number;
  success: boolean;
  error?: string | undefined;
}

interface ScraperConfig {
  timeout?: number | undefined;
  userAgent?: string | undefined;
  maxConcurrency?: number | undefined;
  poolSize?: number | undefined;
  retryAttempts?: number | undefined;
  delay?: number | undefined;
}

interface BrowserInstance {
  browser: Browser;
  context: BrowserContext;
  inUse: boolean;
  lastUsed: Date;
}

export class ScraperTool implements Tool {
  name = 'web_scraper';
  description = 'Extract clean text content from web pages with browser pooling and batch processing';
  
  private timeout: number;
  private userAgent: string;
  private maxConcurrency: number;
  private poolSize: number;
  private retryAttempts: number;
  private delay: number;
  private browserPool: BrowserInstance[] = [];
  private isInitialized = false;
  private activeRequests = 0;

  constructor(config: ScraperConfig = {}) {
    this.timeout = config.timeout || 30000;
    this.userAgent = config.userAgent || 'AI Research Agent/1.0';
    this.maxConcurrency = config.maxConcurrency || 3;
    this.poolSize = config.poolSize || 2;
    this.retryAttempts = config.retryAttempts || 3;
    this.delay = config.delay || 1000;
  }

  async execute(input: {
    url: string;
    waitForSelector?: string | undefined;
    extractImages?: boolean | undefined;
    extractLinks?: boolean | undefined;
    customSelectors?: Record<string, string> | undefined;
  }): Promise<ScrapedContent> {
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
        } catch (error) {
          this.releaseBrowserInstance(browserInstance);
          throw error;
        }
      } catch (error) {
        attempt++;
        if (attempt >= this.retryAttempts) {
          console.error(`Failed to scrape ${url} after ${this.retryAttempts} attempts:`, error);
          return this.createFallbackResult(url, error);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * this.delay));
      }
    }

    return this.createFallbackResult(url, new Error('Max retry attempts reached'));
  }

  private async scrapeWithBrowser(
    browserInstance: BrowserInstance,
    options: {
      url: string;
      waitForSelector?: string | undefined;
      extractImages: boolean;
      extractLinks: boolean;
      customSelectors: Record<string, string>;
    }
  ): Promise<ScrapedContent> {
    const page = await browserInstance.context.newPage();
    const startTime = Date.now();

    try {
      // Set viewport and user agent
      await page.setViewportSize({ width: 1920, height: 1080 });
      
      // Navigate to the page
      await page.goto(options.url, {
        timeout: Math.min(this.timeout, 15000),
        waitUntil: 'domcontentloaded',
      });

      // Wait for custom selector if provided
      if (options.waitForSelector) {
        try {
          await page.waitForSelector(options.waitForSelector, { timeout: 5000 });
        } catch (error) {
          console.warn(`Selector ${options.waitForSelector} not found, continuing anyway`);
        }
      }

      // Extract content
      const html = await page.content();
      const dom = new JSDOM(html, { url: options.url });
      const reader = new Readability(dom.window.document);
      const article = reader.parse();

      let title = 'Untitled';
      let content = '';
      let metadata: any = {};

      if (article) {
        title = article.title || 'Untitled';
        content = article.textContent || '';
        metadata = {
          author: article.byline || undefined,
          publishedDate: article.publishedTime || undefined,
          description: dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
        };
      } else {
        // Fallback content extraction
        title = dom.window.document.title || 'Untitled';
        const bodyText = dom.window.document.body?.textContent || '';
        content = bodyText.replace(/\s+/g, ' ').trim().substring(0, 5000);
        
        metadata = {
          author: dom.window.document.querySelector('meta[name="author"]')?.getAttribute('content') || undefined,
          publishedDate: dom.window.document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') || undefined,
          description: dom.window.document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined,
        };
      }

      // Extract additional data if requested
      if (options.extractImages) {
        const images = await page.$$eval('img', imgs => 
          imgs.map(img => ({
            src: img.src,
            alt: img.alt,
            title: img.title,
          })).filter(img => img.src && img.src.startsWith('http'))
        );
        metadata.images = images;
      }

      if (options.extractLinks) {
        const links = await page.$$eval('a', links => 
          links.map(link => ({
            href: link.href,
            text: link.textContent?.trim(),
            title: link.title,
          })).filter(link => link.href && link.href.startsWith('http'))
        );
        metadata.links = links;
      }

      // Extract custom selectors
      for (const [key, selector] of Object.entries(options.customSelectors)) {
        try {
          const element = await page.$(selector);
          if (element) {
            metadata[key] = await element.textContent();
          }
        } catch (error) {
          console.warn(`Failed to extract custom selector ${key}: ${selector}`, error);
        }
      }

      // Add performance metrics
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

    } finally {
      await page.close();
    }
  }

  private async initializeBrowserPool(): Promise<void> {
    if (this.isInitialized) return;

    for (let i = 0; i < this.poolSize; i++) {
      const browser = await chromium.launch({
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

  private async getBrowserInstance(): Promise<BrowserInstance> {
    // Wait for available browser instance
    while (this.activeRequests >= this.maxConcurrency) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const availableInstance = this.browserPool.find(instance => !instance.inUse);
    
    if (!availableInstance) {
      // Wait for an instance to become available
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.getBrowserInstance();
    }

    availableInstance.inUse = true;
    availableInstance.lastUsed = new Date();
    this.activeRequests++;

    return availableInstance;
  }

  private releaseBrowserInstance(instance: BrowserInstance): void {
    instance.inUse = false;
    instance.lastUsed = new Date();
    this.activeRequests--;
  }

  async scrapeMultipleUrls(urls: string[], options: {
    concurrency?: number | undefined;
    delay?: number | undefined;
    extractImages?: boolean | undefined;
    extractLinks?: boolean | undefined;
    customSelectors?: Record<string, string> | undefined;
  } = {}): Promise<ScrapedContent[]> {
    const { 
      concurrency = this.maxConcurrency, 
      delay = this.delay, 
      extractImages = false, 
      extractLinks = false, 
      customSelectors = {} 
    } = options;

    const results: ScrapedContent[] = [];
    
    // Process URLs in batches
    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      
      const batchPromises = batch.map(async (url, index) => {
        // Stagger requests to avoid overwhelming servers
        await new Promise(resolve => setTimeout(resolve, index * delay));
        
        try {
          return await this.execute({ 
            url, 
            extractImages, 
            extractLinks, 
            customSelectors 
          });
        } catch (error) {
          console.error(`Failed to scrape ${url}:`, error);
          return this.createFallbackResult(url, error);
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  async validateUrl(url: string): Promise<boolean> {
    try {
      const urlObj = new URL(url);
      
      // Check protocol
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        return false;
      }

      // Check for suspicious patterns
      const suspiciousPatterns = [
        /javascript:/i,
        /data:/i,
        /file:/i,
        /ftp:/i,
      ];

      if (suspiciousPatterns.some(pattern => pattern.test(url))) {
        return false;
      }

      // Check for non-scrapable file extensions
      const nonScrapableExtensions = [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.zip', '.rar', '.7z', '.tar', '.gz',
        '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
        '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
        '.mp3', '.wav', '.ogg', '.flac', '.aac',
        '.exe', '.dmg', '.pkg', '.deb', '.rpm'
      ];

      const urlPath = urlObj.pathname.toLowerCase();
      if (nonScrapableExtensions.some(ext => urlPath.endsWith(ext))) {
        console.warn(`Skipping non-scrapable file: ${url}`);
        return false;
      }

      // Quick HEAD request to check content type (with timeout)
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch(url, { 
          method: 'HEAD', 
          signal: controller.signal,
          headers: {
            'User-Agent': this.userAgent
          }
        });
        
        clearTimeout(timeoutId);
        
        const contentType = response.headers.get('content-type')?.toLowerCase() || '';
        
        // Check if content type is scrapable
        const nonScrapableTypes = [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument',
          'application/vnd.ms-excel',
          'application/vnd.ms-powerpoint',
          'application/zip',
          'application/x-rar-compressed',
          'image/',
          'video/',
          'audio/',
          'application/octet-stream'
        ];

        if (nonScrapableTypes.some(type => contentType.includes(type))) {
          console.warn(`Skipping non-scrapable content type: ${contentType} for ${url}`);
          return false;
        }

        return true;
      } catch (error) {
        // If HEAD request fails, assume it's scrapable (might be a server issue)
        console.warn(`HEAD request failed for ${url}, assuming scrapable:`, error);
        return true;
      }
    } catch {
      return false;
    }
  }

  async getPageTitle(url: string): Promise<string | null> {
    try {
      const result = await this.execute({ url });
      return result.title;
    } catch (error) {
      console.error(`Failed to get page title for ${url}:`, error);
      return null;
    }
  }

  async extractSpecificContent(url: string, selectors: Record<string, string>): Promise<Record<string, string>> {
    try {
      const result = await this.execute({ url, customSelectors: selectors });
      const extracted: Record<string, string> = {};
      
      for (const key of Object.keys(selectors)) {
        extracted[key] = result.metadata[key] || '';
      }
      
      return extracted;
    } catch (error) {
      console.error(`Failed to extract specific content from ${url}:`, error);
      return {};
    }
  }

  async batchExtract(requests: Array<{
    url: string;
    selectors?: Record<string, string> | undefined;
    waitForSelector?: string | undefined;
  }>): Promise<ScrapedContent[]> {
    const results: ScrapedContent[] = [];
    
    for (const request of requests) {
      try {
        const result = await this.execute({
          url: request.url,
          customSelectors: request.selectors || {},
          waitForSelector: request.waitForSelector,
        });
        results.push(result);
      } catch (error) {
        console.error(`Batch extract failed for ${request.url}:`, error);
        results.push(this.createFallbackResult(request.url, error));
      }
    }
    
    return results;
  }

  private createFallbackResult(url: string, error: any): ScrapedContent {
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

  async getPoolStats(): Promise<{
    poolSize: number;
    activeRequests: number;
    availableInstances: number;
    totalRequests: number;
  }> {
    return {
      poolSize: this.browserPool.length,
      activeRequests: this.activeRequests,
      availableInstances: this.browserPool.filter(instance => !instance.inUse).length,
      totalRequests: this.browserPool.reduce((sum, instance) => sum + (instance.inUse ? 1 : 0), 0),
    };
  }

  async close(): Promise<void> {
    for (const instance of this.browserPool) {
      try {
        await instance.context.close();
        await instance.browser.close();
      } catch (error) {
        console.error('Error closing browser instance:', error);
      }
    }
    
    this.browserPool = [];
    this.isInitialized = false;
    this.activeRequests = 0;
  }

  async health(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initializeBrowserPool();
      }
      
      // Test with a simple page
      const testResult = await this.execute({ url: 'https://httpbin.org/html' });
      return testResult.success;
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }
} 