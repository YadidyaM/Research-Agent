import { LLMProvider } from '../types';
import { HfInference } from '@huggingface/inference';
import axios from 'axios';
import { PROMPT_TEMPLATES, PROMPT_CONFIG } from '../config/prompts';
import { ILLMService, LLMGenerationOptions, ChatMessage, SourceCredibilityResult } from '../interfaces/services/ILLMService';
import { ConfigurationManager, LLMConfig } from '../config/ConfigurationManager';

export class LLMService implements ILLMService {
  private config: LLMConfig;
  private hfClient?: HfInference;
  private configManager: ConfigurationManager;

  constructor(config?: Partial<LLMConfig>) {
    this.configManager = ConfigurationManager.getInstance();
    this.config = config ? { ...this.configManager.getLLMConfig(), ...config } : this.configManager.getLLMConfig();
    
    if (this.config.provider === 'huggingface' && this.config.apiKey) {
      this.hfClient = new HfInference(this.config.apiKey);
    }

    // Watch for configuration changes
    this.configManager.watch('llm', (newConfig: LLMConfig) => {
      this.updateConfig(newConfig);
    });
  }

  async generateText(prompt: string, options: LLMGenerationOptions = {}): Promise<string> {
    // Implementation will vary based on provider
    switch (this.config.provider) {
      case 'deepseek':
        return this.generateWithDeepSeek(prompt, options);
      case 'openai':
        return this.generateWithOpenAI(prompt, options);
      case 'huggingface':
        return this.generateWithHuggingFace(prompt, options);
      default:
        throw new Error(`Unsupported LLM provider: ${this.config.provider}`);
    }
  }

  private async generateWithOpenAI(prompt: string, options: LLMGenerationOptions): Promise<string> {
    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = {
      model: this.config.model,
      messages: messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.7,
    };

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: 60000,
      }
    );

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from OpenAI');
    }

    return response.data.choices[0].message.content;
  }

  private async generateWithHuggingFace(prompt: string, options: LLMGenerationOptions): Promise<string> {
    if (!this.hfClient) {
      throw new Error('HuggingFace client not initialized');
    }

    const response = await this.hfClient.textGeneration({
      model: this.config.model,
      inputs: prompt,
      parameters: {
        max_new_tokens: options.maxTokens,
        temperature: options.temperature ?? 0.7,
        return_full_text: false,
      },
    });

    return response.generated_text;
  }

  private async generateWithDeepSeek(prompt: string, options: LLMGenerationOptions): Promise<string> {
    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: prompt });

    const payload = {
      model: this.config.model,
      messages: messages,
      max_tokens: options.maxTokens,
      temperature: options.temperature ?? 0.7,
    };

    const response = await axios.post(
      `${this.config.endpoint}/chat/completions`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: 60000,
      }
    );

    if (!response.data.choices || response.data.choices.length === 0) {
      throw new Error('No response from DeepSeek');
    }

    return response.data.choices[0].message.content;
  }

  async createChatCompletion(messages: ChatMessage[], options: {
    maxTokens?: number;
    temperature?: number;
  } = {}): Promise<string> {
    const { maxTokens = 1000, temperature = 0.7 } = options;

    // Convert messages to a single prompt for non-chat models
    const prompt = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    return await this.generateText(prompt, { maxTokens, temperature });
  }

  async generateResearchPlan(query: string): Promise<string> {
    const prompt = PROMPT_TEMPLATES.RESEARCH_PLAN(query);
    const config = PROMPT_CONFIG.DEFAULTS.RESEARCH_PLAN;
    
    return this.generateText(prompt, {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });
  }

  async isContentRelevant(content: string, query: string): Promise<boolean> {
    const prompt = PROMPT_TEMPLATES.RELEVANCE_CHECK(query, content);
    const config = PROMPT_CONFIG.DEFAULTS.RELEVANCE_CHECK;

    const response = await this.generateText(prompt, {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    return response.toLowerCase().includes('true');
  }

  async extractKeyPoints(content: string): Promise<string[]> {
    const prompt = PROMPT_TEMPLATES.EXTRACT_POINTS(content);
    const config = PROMPT_CONFIG.DEFAULTS.EXTRACT_POINTS;

    const response = await this.generateText(prompt, {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });

    return response
      .split('\n')
      .filter(line => line.trim().match(/^\d+\./))
      .map(point => point.replace(/^\d+\.\s*/, '').trim());
  }

  async synthesizeFindings(findings: string[]): Promise<string> {
    const prompt = PROMPT_TEMPLATES.SYNTHESIZE(findings);
    const config = PROMPT_CONFIG.DEFAULTS.SYNTHESIZE;

    return this.generateText(prompt, {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });
  }

  async basicChat(query: string): Promise<string> {
    const prompt = PROMPT_TEMPLATES.BASIC_CHAT(query);
    const config = PROMPT_CONFIG.DEFAULTS.BASIC_CHAT;

    return this.generateText(prompt, {
      maxTokens: config.maxTokens,
      temperature: config.temperature,
    });
  }

  // Additional utility methods for advanced prompting
  async optimizeSearchQuery(query: string): Promise<string[]> {
    const prompt = PROMPT_TEMPLATES.OPTIMIZE_SEARCH(query);
    
    const response = await this.generateText(prompt, {
      maxTokens: PROMPT_CONFIG.MAX_TOKENS.MEDIUM,
      temperature: PROMPT_CONFIG.TEMPERATURE.ANALYTICAL,
    });

    return response
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.trim());
  }

  async evaluateSourceCredibility(url: string, title: string, content: string): Promise<SourceCredibilityResult> {
    const prompt = PROMPT_TEMPLATES.EVALUATE_SOURCE(url, title, content);
    
    const response = await this.generateText(prompt, {
      maxTokens: PROMPT_CONFIG.MAX_TOKENS.MEDIUM,
      temperature: PROMPT_CONFIG.TEMPERATURE.ANALYTICAL,
    });

    // Extract score and reasoning from response
    const scoreMatch = response.match(/(\d+)\/10|(\d+) out of 10|score:?\s*(\d+)/i);
    let score = 5; // Default score
    if (scoreMatch) {
      const scoreStr = scoreMatch[1] || scoreMatch[2] || scoreMatch[3] || '5';
      score = parseInt(scoreStr) || 5;
    }
    
    return {
      score: Math.min(Math.max(score, 1), 10), // Ensure score is between 1-10
      reasoning: response
    };
  }

  async generateResponse(query: string): Promise<string> {
    return this.generateText(query);
  }

  // Configuration methods
  getProvider(): string {
    return this.config.provider;
  }

  getModel(): string {
    return this.config.model;
  }

  updateConfig(config: Partial<LLMConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Reinitialize HuggingFace client if needed
    if (this.config.provider === 'huggingface' && this.config.apiKey) {
      this.hfClient = new HfInference(this.config.apiKey);
    }
  }
} 