"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunner = void 0;
const llm_service_1 = require("../services/llm.service");
const WebSearchTool_1 = require("../tools/WebSearchTool");
const ScraperTool_1 = require("../tools/ScraperTool");
const uuid_1 = require("uuid");
const config_1 = require("../config");
class AgentRunner {
    constructor() {
        Object.defineProperty(this, "llmService", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "memoryStore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "tools", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "currentTask", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: null
        });
        Object.defineProperty(this, "executionSteps", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
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
        this.llmService = new llm_service_1.LLMService({
            provider: config_1.config.llm.provider,
            endpoint: config_1.config.llm.ollamaEndpoint,
            apiKey: config_1.config.llm.provider === 'openai' ? config_1.config.llm.openaiApiKey : config_1.config.llm.huggingfaceApiKey,
            model: config_1.config.llm.provider === 'ollama' ? config_1.config.llm.ollamaModel : config_1.config.llm.openaiModel,
        });
        this.webSearchTool = new WebSearchTool_1.WebSearchTool({
            provider: config_1.config.tools.webSearch.provider,
            apiKey: config_1.config.tools.webSearch.serpApiKey,
        });
        this.scraperTool = new ScraperTool_1.ScraperTool({
            timeout: config_1.config.tools.scraper.timeout,
            userAgent: config_1.config.tools.scraper.userAgent,
        });
        this.tools = new Map();
        this.memoryStore = {};
    }
    async executeTask(task) {
        this.currentTask = task;
        this.executionSteps = [];
        try {
            task.status = 'running';
            task.updatedAt = new Date();
            this.addExecutionStep('task_start', 'Starting task execution', {
                taskId: task.id,
                taskType: task.type,
                query: task.query,
            });
            let result;
            switch (task.type) {
                case 'research':
                    result = await this.executeResearchTask(task);
                    break;
                case 'analysis':
                    result = await this.executeAnalysisTask(task);
                    break;
                case 'synthesis':
                    result = await this.executeSynthesisTask(task);
                    break;
                default:
                    throw new Error(`Unsupported task type: ${task.type}`);
            }
            task.status = 'completed';
            task.result = result;
            task.updatedAt = new Date();
            await this.memoryStore.storeExperience({
                context: `Task: ${task.type} - ${task.query}`,
                action: 'execute_task',
                result: JSON.stringify(result),
                success: true,
                metadata: {
                    taskId: task.id,
                    taskType: task.type,
                    stepsCount: this.executionSteps.length,
                },
            });
            this.addExecutionStep('task_complete', 'Task completed successfully', result);
            return result;
        }
        catch (error) {
            console.error('Task execution failed:', error);
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : 'Unknown error';
            task.updatedAt = new Date();
            await this.memoryStore.storeExperience({
                context: `Task: ${task.type} - ${task.query}`,
                action: 'execute_task',
                result: `Error: ${task.error}`,
                success: false,
                metadata: {
                    taskId: task.id,
                    taskType: task.type,
                    stepsCount: this.executionSteps.length,
                },
            });
            this.addExecutionStep('task_error', 'Task failed', {
                error: task.error,
            });
            throw error;
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
        };
        try {
            const plan = await this.llmService.generateResearchPlan(query);
            console.log('Research plan:', plan);
            const searchResults = await this.webSearchTool.execute({ query });
            context.sources = searchResults.map(result => result.url);
            for (const result of searchResults.slice(0, 3)) {
                try {
                    const content = await this.scraperTool.execute({ url: result.url });
                    const isRelevant = await this.llmService.isContentRelevant(content.content, query);
                    if (isRelevant) {
                        const keyPoints = await this.llmService.extractKeyPoints(content.content);
                        context.findings.push(...keyPoints);
                    }
                }
                catch (error) {
                    console.error(`Failed to process ${result.url}:`, error);
                }
            }
            if (context.findings.length > 0) {
                context.synthesis = await this.llmService.synthesizeFindings(context.findings);
                context.confidence = 0.8;
            }
            else {
                context.synthesis = 'No significant findings were discovered.';
                context.confidence = 0.1;
            }
            return context;
        }
        catch (error) {
            console.error('Research task failed:', error);
            throw error;
        }
    }
    async executeAnalysisTask(task) {
        const { query } = task;
        this.addExecutionStep('analysis_start', 'Starting analysis task', { query });
        const dataRequirements = await this.llmService.generateText(`Analyze this request and identify what data or information is needed: ${query}`, { maxTokens: 500, temperature: 0.3 });
        this.addExecutionStep('data_requirements', 'Identified data requirements', {
            requirements: dataRequirements
        });
        const relevantData = await this.memoryStore.searchMemories(query, {
            limit: 20,
            threshold: 0.6,
        });
        if (relevantData.length > 0) {
            this.addExecutionStep('data_analysis', 'Analyzing available data', {
                dataPoints: relevantData.length
            });
            const dataContent = relevantData.map(item => item.content).join('\n\n');
            const pythonTool = this.tools.get('python_executor');
            try {
                const analysisCode = `
# Data Analysis
data_text = """${dataContent.replace(/"/g, '\\"')}"""

# Basic text analysis
import re
from collections import Counter

# Extract numbers
numbers = re.findall(r'\\b\\d+(?:\\.\\d+)?\\b', data_text)
numeric_data = [float(n) for n in numbers if n]

# Word frequency
words = re.findall(r'\\b\\w+\\b', data_text.lower())
word_freq = Counter(words)

print("=== Data Analysis Results ===")
print(f"Total data points: ${relevantData.length}")
print(f"Numeric values found: {len(numeric_data)}")
if numeric_data:
    print(f"Numeric range: {min(numeric_data):.2f} - {max(numeric_data):.2f}")
    print(f"Average: {sum(numeric_data)/len(numeric_data):.2f}")

print("\\nTop 10 most frequent words:")
for word, count in word_freq.most_common(10):
    print(f"{word}: {count}")
        `;
                const analysisResult = await pythonTool.execute({
                    code: analysisCode,
                    packages: ['re', 'collections'],
                });
                this.addExecutionStep('python_analysis', 'Performed Python analysis', {
                    success: analysisResult.success,
                    output: analysisResult.output,
                });
                const insights = await this.llmService.generateText(`Based on this analysis, provide key insights and conclusions: ${analysisResult.output}`, { maxTokens: 800, temperature: 0.4 });
                return {
                    query,
                    dataPoints: relevantData.length,
                    analysisResult: analysisResult.output,
                    insights,
                    confidence: 0.8,
                };
            }
            catch (error) {
                console.error('Python analysis failed:', error);
                const llmAnalysis = await this.llmService.generateText(`Analyze this data and provide insights: ${dataContent}`, { maxTokens: 1000, temperature: 0.4 });
                return {
                    query,
                    dataPoints: relevantData.length,
                    analysisResult: llmAnalysis,
                    insights: llmAnalysis,
                    confidence: 0.6,
                };
            }
        }
        else {
            const suggestions = await this.llmService.generateText(`No data available for analysis: ${query}. Suggest how to collect relevant data.`, { maxTokens: 500, temperature: 0.3 });
            return {
                query,
                dataPoints: 0,
                analysisResult: 'No data available for analysis',
                suggestions,
                confidence: 0.3,
            };
        }
    }
    async executeSynthesisTask(task) {
        const { query } = task;
        this.addExecutionStep('synthesis_start', 'Starting synthesis task', { query });
        const relevantInfo = await this.memoryStore.searchMemories(query, {
            limit: 50,
            threshold: 0.5,
        });
        this.addExecutionStep('information_gathering', 'Gathered relevant information', {
            infoCount: relevantInfo.length,
        });
        if (relevantInfo.length === 0) {
            return {
                query,
                synthesis: 'No relevant information found for synthesis.',
                confidence: 0.1,
                sources: [],
            };
        }
        const groupedInfo = {
            research: relevantInfo.filter(info => info.metadata?.type === 'research'),
            experience: relevantInfo.filter(info => info.metadata?.type === 'experience'),
            conversation: relevantInfo.filter(info => info.metadata?.type === 'conversation'),
            other: relevantInfo.filter(info => !['research', 'experience', 'conversation'].includes(info.metadata?.type)),
        };
        this.addExecutionStep('information_grouping', 'Grouped information by type', {
            research: groupedInfo.research.length,
            experience: groupedInfo.experience.length,
            conversation: groupedInfo.conversation.length,
            other: groupedInfo.other.length,
        });
        const syntheses = [];
        for (const [type, items] of Object.entries(groupedInfo)) {
            if (items.length > 0) {
                const content = items.map(item => item.content).join('\n\n');
                const synthesis = await this.llmService.synthesizeFindings(items.map(item => item.content));
                syntheses.push(`**${type.charAt(0).toUpperCase() + type.slice(1)} Synthesis:**\n${synthesis}`);
            }
        }
        const overallSynthesis = await this.llmService.synthesizeFindings(syntheses);
        this.addExecutionStep('synthesis_complete', 'Completed synthesis', {
            sectionsCount: syntheses.length,
        });
        const result = {
            query,
            synthesis: overallSynthesis,
            sections: syntheses,
            confidence: Math.min(0.9, relevantInfo.length / 20),
            sources: relevantInfo.map(info => info.id),
            infoCount: relevantInfo.length,
        };
        await this.memoryStore.storeExperience({
            context: `Synthesis: ${query}`,
            action: 'synthesize_information',
            result: JSON.stringify(result),
            success: true,
            metadata: {
                infoCount: relevantInfo.length,
                confidence: result.confidence,
            },
        });
        return result;
    }
    addExecutionStep(action, description, data) {
        const step = {
            step: this.executionSteps.length + 1,
            action,
            tool: undefined,
            input: description,
            output: data,
            timestamp: new Date(),
        };
        this.executionSteps.push(step);
    }
    async createTask(type, query) {
        const task = {
            id: (0, uuid_1.v4)(),
            type,
            query,
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        return task;
    }
    async getTaskStatus(taskId) {
        return this.currentTask?.id === taskId ? this.currentTask : null;
    }
    async cancelTask(taskId) {
        if (this.currentTask?.id === taskId) {
            this.currentTask.status = 'failed';
            this.currentTask.error = 'Task cancelled by user';
            this.currentTask.updatedAt = new Date();
            return true;
        }
        return false;
    }
    getAvailableTools() {
        return Array.from(this.tools.keys());
    }
    async getToolCapabilities(toolName) {
        const tool = this.tools.get(toolName);
        if (!tool) {
            throw new Error(`Tool not found: ${toolName}`);
        }
        switch (toolName) {
            case 'web_search':
                return tool.getSearchMetrics();
            case 'python_executor':
                return tool.getCapabilities();
            default:
                return { name: tool.name, description: tool.description };
        }
    }
    async health() {
        const toolsHealth = {};
        for (const [name, tool] of this.tools) {
            try {
                toolsHealth[name] = await tool.health ? tool.health() : true;
            }
            catch {
                toolsHealth[name] = false;
            }
        }
        const memoryHealth = await this.memoryStore.health();
        const overallHealth = Object.values(toolsHealth).every(h => h) && memoryHealth;
        return {
            status: overallHealth ? 'healthy' : 'degraded',
            tools: toolsHealth,
            memory: memoryHealth,
        };
    }
}
exports.AgentRunner = AgentRunner;
//# sourceMappingURL=agent.runner.js.map