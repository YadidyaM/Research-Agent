"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleAgentRunner = void 0;
const llm_service_1 = require("../services/llm.service");
const WebSearchTool_1 = require("../tools/WebSearchTool");
const ScraperTool_1 = require("../tools/ScraperTool");
const config_1 = require("../config");
class SimpleAgentRunner {
    constructor() {
        Object.defineProperty(this, "llmService", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "webSearchTool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "scraperTool", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "progressCallback", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.llmService = new llm_service_1.LLMService({
            provider: config_1.config.llm.provider,
            endpoint: config_1.config.llm.ollamaEndpoint,
            apiKey: config_1.config.llm.provider === 'openai' ? config_1.config.llm.openaiApiKey : config_1.config.llm.huggingfaceApiKey,
            model: config_1.config.llm.provider === 'ollama' ? config_1.config.llm.ollamaModel : config_1.config.llm.openaiModel,
        });
        this.webSearchTool = new WebSearchTool_1.WebSearchTool({
            provider: config_1.config.tools.webSearch.provider,
            apiKey: config_1.config.tools.webSearch.serpApiKey,
            tavilyApiKey: config_1.config.tools.webSearch.tavilyApiKey,
        });
        this.scraperTool = new ScraperTool_1.ScraperTool({
            timeout: config_1.config.tools.scraper.timeout,
            userAgent: config_1.config.tools.scraper.userAgent,
        });
    }
    setProgressCallback(callback) {
        this.progressCallback = callback;
    }
    emitStep(step, status, description, data) {
        const researchStep = {
            id: `${step}-${Date.now()}`,
            step,
            status,
            description,
            data,
            timestamp: new Date(),
        };
        console.log(`[${status.toUpperCase()}] ${step}: ${description}`);
        if (this.progressCallback) {
            this.progressCallback(researchStep);
        }
        return researchStep;
    }
    async executeTask(task) {
        switch (task.type) {
            case 'research':
                return this.executeResearchTask(task);
            default:
                throw new Error(`Unsupported task type: ${task.type}`);
        }
    }
    async executeResearchTask(task) {
        const { query } = task;
        const context = {
            query,
            findings: [],
            sources: [],
            synthesis: '',
            confidence: 0,
            steps: [],
        };
        try {
            const planStep = this.emitStep('planning', 'running', 'Generating research plan using AI...');
            context.steps.push(planStep);
            const plan = await this.llmService.generateResearchPlan(query);
            planStep.status = 'completed';
            planStep.data = { plan };
            this.emitStep('planning', 'completed', 'Research plan generated successfully', { plan });
            const searchStep = this.emitStep('searching', 'running', 'Searching the web for relevant sources...');
            context.steps.push(searchStep);
            const searchResults = await this.webSearchTool.execute({ query });
            context.sources = searchResults.map(result => result.url);
            searchStep.status = 'completed';
            searchStep.data = { results: searchResults, count: searchResults.length };
            this.emitStep('searching', 'completed', `Found ${searchResults.length} potential sources`, {
                results: searchResults.map(r => ({ title: r.title, url: r.url })),
                count: searchResults.length
            });
            const scrapingStep = this.emitStep('scraping', 'running', `Analyzing content from top ${Math.min(3, searchResults.length)} sources...`);
            context.steps.push(scrapingStep);
            let successfulScrapes = 0;
            const scrapingResults = [];
            for (const [index, result] of searchResults.slice(0, 3).entries()) {
                try {
                    this.emitStep('scraping', 'running', `Extracting content from: ${result.title}`);
                    const content = await this.scraperTool.execute({ url: result.url });
                    const isRelevant = await this.llmService.isContentRelevant(content.content, query);
                    scrapingResults.push({
                        url: result.url,
                        title: result.title,
                        success: true,
                        relevant: isRelevant,
                        contentLength: content.content.length
                    });
                    if (isRelevant) {
                        const keyPoints = await this.llmService.extractKeyPoints(content.content);
                        context.findings.push(...keyPoints);
                        successfulScrapes++;
                    }
                }
                catch (error) {
                    console.error(`Failed to process ${result.url}:`, error);
                    scrapingResults.push({
                        url: result.url,
                        title: result.title,
                        success: false,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
            scrapingStep.status = 'completed';
            scrapingStep.data = { results: scrapingResults, successful: successfulScrapes };
            this.emitStep('scraping', 'completed', `Successfully analyzed ${successfulScrapes} relevant sources`, {
                results: scrapingResults,
                successful: successfulScrapes
            });
            const synthesisStep = this.emitStep('synthesis', 'running', 'Synthesizing research findings...');
            context.steps.push(synthesisStep);
            if (context.findings.length > 0) {
                context.synthesis = await this.llmService.synthesizeFindings(context.findings);
                context.confidence = Math.min(0.9, 0.3 + (successfulScrapes * 0.2));
                synthesisStep.status = 'completed';
                synthesisStep.data = {
                    findingsCount: context.findings.length,
                    confidence: context.confidence,
                    synthesis: context.synthesis
                };
                this.emitStep('synthesis', 'completed', `Research completed with ${context.findings.length} key findings`, {
                    findingsCount: context.findings.length,
                    confidence: context.confidence
                });
            }
            else {
                context.synthesis = 'No significant findings were discovered from the available sources.';
                context.confidence = 0.1;
                synthesisStep.status = 'completed';
                synthesisStep.data = { findingsCount: 0, confidence: 0.1 };
                this.emitStep('synthesis', 'completed', 'Research completed with limited findings', {
                    findingsCount: 0,
                    confidence: 0.1
                });
            }
            return context;
        }
        catch (error) {
            this.emitStep('error', 'error', `Research failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error('Research task failed:', error);
            throw error;
        }
    }
}
exports.SimpleAgentRunner = SimpleAgentRunner;
//# sourceMappingURL=simple-agent.runner.js.map