"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSearchTool = void 0;
const core_1 = require("@tavily/core");
class WebSearchTool {
    constructor(config) {
        Object.defineProperty(this, "name", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'web_search'
        });
        Object.defineProperty(this, "description", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 'Search the web for information using advanced AI-powered search'
        });
        Object.defineProperty(this, "config", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "requestCount", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "lastRequestTime", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: 0
        });
        Object.defineProperty(this, "tavilyClient", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.config = {
            timeout: 30000,
            maxRetries: 3,
            ...config,
        };
        if (this.config.tavilyApiKey) {
            this.tavilyClient = (0, core_1.tavily)({ apiKey: this.config.tavilyApiKey });
        }
    }
    async execute(input) {
        const { query, maxResults = 10, searchDepth = 'basic', topic = 'general', includeDomains = [], excludeDomains = [], timeRange, includeAnswer = false, includeRawContent = false } = input;
        await this.enforceRateLimit();
        if (!await this.validateQuery(query)) {
            throw new Error('Invalid search query');
        }
        let attempt = 0;
        while (attempt < this.config.maxRetries) {
            try {
                switch (this.config.provider) {
                    case 'tavily':
                        return await this.searchWithTavily(query, {
                            maxResults,
                            searchDepth,
                            topic,
                            includeDomains,
                            excludeDomains,
                            timeRange,
                            includeAnswer,
                            includeRawContent
                        });
                    case 'duckduckgo':
                        return await this.searchWithDuckDuckGo(query, maxResults);
                    case 'serpapi':
                        if (!this.config.apiKey) {
                            throw new Error('SerpAPI key is required');
                        }
                        return await this.searchWithSerpApi(query, maxResults);
                    default:
                        throw new Error(`Unsupported search provider: ${this.config.provider}`);
                }
            }
            catch (error) {
                attempt++;
                if (attempt >= this.config.maxRetries) {
                    console.error(`Search failed after ${this.config.maxRetries} attempts:`, error);
                    return this.createFallbackResults(query, maxResults);
                }
                await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
            }
        }
        return [];
    }
    async searchWithTavily(query, options) {
        if (!this.tavilyClient) {
            throw new Error('Tavily API key not configured');
        }
        try {
            const searchOptions = {
                search_depth: options.searchDepth,
                topic: options.topic,
                max_results: Math.min(options.maxResults, 20),
                include_answer: options.includeAnswer,
                include_raw_content: options.includeRawContent,
                include_images: false,
            };
            if (options.includeDomains.length > 0) {
                searchOptions.include_domains = options.includeDomains;
            }
            if (options.excludeDomains.length > 0) {
                searchOptions.exclude_domains = options.excludeDomains;
            }
            if (options.timeRange) {
                searchOptions.time_range = options.timeRange;
            }
            const response = await this.tavilyClient.search(query, searchOptions);
            return response.results.map(result => ({
                title: result.title,
                url: result.url,
                snippet: result.content,
                score: result.score,
                publishedDate: result.published_date,
                favicon: result.favicon,
                rawContent: result.raw_content,
            }));
        }
        catch (error) {
            console.error('Tavily search error:', error);
            throw error;
        }
    }
    async searchWithDuckDuckGo(query, maxResults) {
        try {
            const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
            if (!response.ok) {
                throw new Error('DuckDuckGo search failed');
            }
            const data = await response.json();
            const results = [];
            if (data.Abstract && data.AbstractURL) {
                results.push({
                    title: data.Heading || 'DuckDuckGo Result',
                    url: data.AbstractURL,
                    snippet: data.Abstract,
                });
            }
            if (data.RelatedTopics && Array.isArray(data.RelatedTopics)) {
                data.RelatedTopics
                    .filter((topic) => topic.Text && topic.FirstURL)
                    .slice(0, maxResults - results.length)
                    .forEach((topic) => {
                    results.push({
                        title: topic.Text.split(' - ')[0] || topic.Text,
                        url: topic.FirstURL,
                        snippet: topic.Text,
                    });
                });
            }
            if (results.length === 0) {
                return this.createFallbackResults(query, maxResults);
            }
            return results.slice(0, maxResults);
        }
        catch (error) {
            console.error('DuckDuckGo search error:', error);
            return this.createFallbackResults(query, maxResults);
        }
    }
    async searchWithSerpApi(query, maxResults) {
        const response = await fetch(`https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${this.config.apiKey}`);
        if (!response.ok) {
            throw new Error('SerpAPI search failed');
        }
        const data = await response.json();
        return data.organic_results
            .slice(0, maxResults)
            .map((result) => ({
            title: result.title,
            url: result.link,
            snippet: result.snippet,
        }));
    }
    createFallbackResults(query, maxResults) {
        const searchEngines = [
            {
                title: `Search "${query}" on Google`,
                url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                snippet: `Google search results for "${query}"`,
            },
            {
                title: `Search "${query}" on Bing`,
                url: `https://www.bing.com/search?q=${encodeURIComponent(query)}`,
                snippet: `Bing search results for "${query}"`,
            },
            {
                title: `Search "${query}" on Wikipedia`,
                url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}`,
                snippet: `Wikipedia search results for "${query}"`,
            },
            {
                title: `Search "${query}" on DuckDuckGo`,
                url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
                snippet: `DuckDuckGo search results for "${query}"`,
            },
        ];
        return searchEngines.slice(0, Math.min(maxResults, searchEngines.length));
    }
    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < 1000) {
            await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest));
        }
        this.lastRequestTime = Date.now();
        this.requestCount++;
    }
    async validateQuery(query) {
        if (!query || typeof query !== 'string') {
            return false;
        }
        if (query.trim().length === 0) {
            return false;
        }
        if (query.length > 1000) {
            return false;
        }
        const maliciousPatterns = [
            /script/i,
            /javascript/i,
            /vbscript/i,
            /onload/i,
            /onerror/i,
        ];
        return !maliciousPatterns.some(pattern => pattern.test(query));
    }
    async suggestSearchTerms(query) {
        const suggestions = [];
        suggestions.push(`${query} research`);
        suggestions.push(`${query} analysis`);
        suggestions.push(`${query} study`);
        suggestions.push(`${query} report`);
        suggestions.push(`${query} data`);
        suggestions.push(`what is ${query}`);
        suggestions.push(`how does ${query} work`);
        suggestions.push(`${query} benefits`);
        suggestions.push(`${query} challenges`);
        return suggestions;
    }
    async searchMultipleQueries(queries, maxResultsPerQuery = 5) {
        const searchPromises = queries.map(async (query) => {
            try {
                const results = await this.execute({ query, maxResults: maxResultsPerQuery });
                return { query, results };
            }
            catch (error) {
                console.error(`Failed to search for query: ${query}`, error);
                return { query, results: [] };
            }
        });
        return await Promise.all(searchPromises);
    }
    async findAcademicSources(query, maxResults = 10) {
        const academicQuery = `${query} site:scholar.google.com OR site:arxiv.org OR site:pubmed.ncbi.nlm.nih.gov OR filetype:pdf`;
        return await this.execute({
            query: academicQuery,
            maxResults,
            includeDomains: ['scholar.google.com', 'arxiv.org', 'pubmed.ncbi.nlm.nih.gov'],
        });
    }
    async findNewsSources(query, maxResults = 10) {
        return await this.execute({
            query,
            maxResults,
            topic: 'news',
            timeRange: 'week',
        });
    }
    async findGovernmentSources(query, maxResults = 10) {
        const govQuery = `${query} site:.gov OR site:.edu`;
        return await this.execute({
            query: govQuery,
            maxResults,
        });
    }
    async extractContent(url) {
        if (!this.tavilyClient) {
            throw new Error('Tavily API key not configured');
        }
        try {
            return await this.tavilyClient.extract(url);
        }
        catch (error) {
            console.error('Tavily extract error:', error);
            throw error;
        }
    }
    async crawlWebsite(url, options = {}) {
        if (!this.tavilyClient) {
            throw new Error('Tavily API key not configured');
        }
        try {
            return await this.tavilyClient.crawl(url, options);
        }
        catch (error) {
            console.error('Tavily crawl error:', error);
            throw error;
        }
    }
    getSearchMetrics() {
        return {
            provider: this.config.provider,
            supportsBatchSearch: true,
            supportsRegionalSearch: this.config.provider === 'serpapi' || this.config.provider === 'tavily',
            requiresApiKey: this.config.provider !== 'duckduckgo',
            requestCount: this.requestCount,
            supportsAdvancedSearch: this.config.provider === 'tavily',
            supportsContentExtraction: this.config.provider === 'tavily',
            supportsCrawling: this.config.provider === 'tavily',
        };
    }
}
exports.WebSearchTool = WebSearchTool;
//# sourceMappingURL=WebSearchTool.js.map