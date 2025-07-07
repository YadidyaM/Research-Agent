import { Tool } from '../types';
import axios from 'axios';

interface WikipediaSearchResult {
  id: number;
  key: string;
  title: string;
  excerpt: string;
  description?: string;
  thumbnail?: {
    mimetype: string;
    width: number;
    height: number;
    duration?: number;
    url: string;
  };
}

interface WikipediaPageSummary {
  type: string;
  title: string;
  displaytitle: string;
  namespace: {
    id: number;
    text: string;
  };
  wikibase_item: string;
  titles: {
    canonical: string;
    normalized: string;
    display: string;
  };
  pageid: number;
  thumbnail?: {
    source: string;
    width: number;
    height: number;
  };
  originalimage?: {
    source: string;
    width: number;
    height: number;
  };
  lang: string;
  dir: string;
  revision: string;
  tid: string;
  timestamp: string;
  description: string;
  description_source: string;
  content_urls: {
    desktop: {
      page: string;
      revisions: string;
      edit: string;
      talk: string;
    };
    mobile: {
      page: string;
      revisions: string;
      edit: string;
      talk: string;
    };
  };
  extract: string;
  extract_html: string;
}

interface WikipediaLanguageLink {
  code: string;
  name: string;
  key: string;
}

interface WikipediaConfig {
  language?: string;
  timeout?: number;
  maxRetries?: number;
  userAgent?: string;
}

export class WikipediaTool implements Tool {
  name = 'wikipedia_search';
  description = 'Search Wikipedia for encyclopedic information and get detailed article summaries';
  private config: WikipediaConfig;
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor(config: WikipediaConfig = {}) {
    this.config = {
      language: 'en',
      timeout: 30000,
      maxRetries: 3,
      userAgent: 'AI-Research-Agent/1.0 (research-agent@example.com)',
      ...config,
    };
  }

  async execute(input: {
    action: 'search' | 'summary' | 'extract' | 'languages' | 'random';
    query?: string;
    title?: string;
    maxResults?: number;
    language?: string;
    includeImages?: boolean;
  }): Promise<any> {
    const { 
      action, 
      query, 
      title, 
      maxResults = 10, 
      language = this.config.language,
      includeImages = true 
    } = input;

    // Rate limiting
    await this.enforceRateLimit();

    let attempt = 0;
    while (attempt < this.config.maxRetries!) {
      try {
        switch (action) {
          case 'search':
            if (!query) throw new Error('Query is required for search action');
            return await this.searchWikipedia(query, maxResults, language!);
          
          case 'summary':
            if (!title) throw new Error('Title is required for summary action');
            return await this.getPageSummary(title, language!);
          
          case 'extract':
            if (!title) throw new Error('Title is required for extract action');
            return await this.getPageExtract(title, language!);
          
          case 'languages':
            if (!title) throw new Error('Title is required for languages action');
            return await this.getLanguageLinks(title, language!);
          
          case 'random':
            return await this.getRandomArticle(language!);
          
          default:
            throw new Error(`Unsupported action: ${action}`);
        }
      } catch (error) {
        attempt++;
        if (attempt >= this.config.maxRetries!) {
          console.error(`Wikipedia API failed after ${this.config.maxRetries} attempts:`, error);
          throw error;
        }
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('Wikipedia API request failed after all retries');
  }

  private async searchWikipedia(query: string, maxResults: number, language: string): Promise<WikipediaSearchResult[]> {
    const baseUrl = `https://api.wikimedia.org/core/v1/wikipedia/${language}`;
    const endpoint = '/search/page';
    const url = `${baseUrl}${endpoint}`;

    const response = await axios.get(url, {
      params: {
        q: query,
        limit: Math.min(maxResults, 50) // Wikipedia API max is 50
      },
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`Wikipedia search failed with status: ${response.status}`);
    }

    return response.data.pages || [];
  }

  private async getPageSummary(title: string, language: string): Promise<WikipediaPageSummary> {
    const baseUrl = `https://${language}.wikipedia.org/api/rest_v1`;
    const endpoint = `/page/summary/${encodeURIComponent(title)}`;
    const url = `${baseUrl}${endpoint}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`Wikipedia summary failed with status: ${response.status}`);
    }

    return response.data;
  }

  private async getPageExtract(title: string, language: string): Promise<{
    title: string;
    extract: string;
    url: string;
  }> {
    const baseUrl = `https://${language}.wikipedia.org/w/api.php`;
    
    const response = await axios.get(baseUrl, {
      params: {
        action: 'query',
        format: 'json',
        titles: title,
        prop: 'extracts',
        exintro: true,
        explaintext: true,
        exsectionformat: 'plain',
      },
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`Wikipedia extract failed with status: ${response.status}`);
    }

    const pages = response.data.query.pages;
    const pageId = Object.keys(pages)[0];
    const page = pages[pageId];

    if (pageId === '-1') {
      throw new Error('Page not found');
    }

    return {
      title: page.title,
      extract: page.extract || 'No extract available',
      url: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
    };
  }

  private async getLanguageLinks(title: string, language: string): Promise<WikipediaLanguageLink[]> {
    const baseUrl = `https://api.wikimedia.org/core/v1/wikipedia/${language}`;
    const endpoint = `/page/${encodeURIComponent(title)}/links/language`;
    const url = `${baseUrl}${endpoint}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`Wikipedia language links failed with status: ${response.status}`);
    }

    return response.data || [];
  }

  private async getRandomArticle(language: string): Promise<WikipediaPageSummary> {
    const baseUrl = `https://${language}.wikipedia.org/api/rest_v1`;
    const endpoint = '/page/random/summary';
    const url = `${baseUrl}${endpoint}`;

    const response = await axios.get(url, {
      headers: {
        'User-Agent': this.config.userAgent,
      },
      timeout: this.config.timeout,
    });

    if (response.status !== 200) {
      throw new Error(`Wikipedia random article failed with status: ${response.status}`);
    }

    return response.data;
  }

  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const minInterval = 100; // 100ms between requests (10 requests/second)

    if (timeSinceLastRequest < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
    this.requestCount++;
  }

  // Helper methods for specific use cases
  async searchForConcept(concept: string, language: string = 'en'): Promise<{
    summary: WikipediaPageSummary;
    relatedArticles: WikipediaSearchResult[];
  }> {
    // First, search for the concept
    const searchResults = await this.searchWikipedia(concept, 5, language);
    
    if (searchResults.length === 0) {
      throw new Error(`No Wikipedia articles found for: ${concept}`);
    }

    // Get detailed summary of the most relevant result
    const topResult = searchResults[0];
    const summary = await this.getPageSummary(topResult.title, language);

    return {
      summary,
      relatedArticles: searchResults.slice(1), // Return other results as related articles
    };
  }

  async getMultiLanguageInfo(title: string, baseLanguage: string = 'en'): Promise<{
    summary: WikipediaPageSummary;
    languages: WikipediaLanguageLink[];
    alternativeLanguageSummaries: Array<{
      language: string;
      summary: WikipediaPageSummary;
    }>;
  }> {
    const summary = await this.getPageSummary(title, baseLanguage);
    const languages = await this.getLanguageLinks(title, baseLanguage);

    // Get summaries in a few major languages
    const majorLanguages = ['es', 'fr', 'de', 'zh', 'ja', 'ru', 'pt', 'it'];
    const availableLanguages = languages
      .filter(lang => majorLanguages.includes(lang.code))
      .slice(0, 3); // Limit to 3 additional languages

    const alternativeLanguageSummaries = await Promise.allSettled(
      availableLanguages.map(async (lang) => ({
        language: lang.name,
        summary: await this.getPageSummary(lang.key, lang.code),
      }))
    );

    return {
      summary,
      languages,
      alternativeLanguageSummaries: alternativeLanguageSummaries
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<any>).value),
    };
  }

  async findRelatedTopics(topic: string, language: string = 'en'): Promise<{
    mainArticle: WikipediaPageSummary;
    relatedSearches: Array<{
      query: string;
      results: WikipediaSearchResult[];
    }>;
  }> {
    const mainArticle = await this.getPageSummary(topic, language);
    
    // Generate related search queries based on the topic
    const relatedQueries = [
      `${topic} history`,
      `${topic} applications`,
      `${topic} research`,
      `${topic} development`,
    ];

    const relatedSearches = await Promise.allSettled(
      relatedQueries.map(async (query) => ({
        query,
        results: await this.searchWikipedia(query, 3, language),
      }))
    );

    return {
      mainArticle,
      relatedSearches: relatedSearches
        .filter(result => result.status === 'fulfilled')
        .map(result => (result as PromiseFulfilledResult<any>).value),
    };
  }

  getToolMetrics(): {
    provider: string;
    language: string;
    requestCount: number;
    supportsSearch: boolean;
    supportsMultiLanguage: boolean;
    supportsRandomArticles: boolean;
    requiresApiKey: boolean;
  } {
    return {
      provider: 'Wikipedia REST API',
      language: this.config.language || 'en',
      requestCount: this.requestCount,
      supportsSearch: true,
      supportsMultiLanguage: true,
      supportsRandomArticles: true,
      requiresApiKey: false,
    };
  }

  async health(): Promise<{
    status: string;
    responseTime: number;
    language: string;
  }> {
    const startTime = Date.now();
    
    try {
      await this.getRandomArticle(this.config.language || 'en');
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        language: this.config.language || 'en',
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        language: this.config.language || 'en',
      };
    }
  }
} 