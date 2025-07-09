import { LLMProvider } from '../types';
import { HfInference } from '@huggingface/inference';
import axios from 'axios';
import { PROMPT_TEMPLATES, PROMPT_CONFIG } from '../config/prompts';
import { ILLMService, LLMGenerationOptions, ChatMessage, SourceCredibilityResult, StreamingOptions, StreamChunk } from '../interfaces/services/ILLMService';
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
      case 'ollama':
        return this.generateWithOllama(prompt, options);
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

  private async generateWithOllama(prompt: string, options: LLMGenerationOptions): Promise<string> {
    const endpoint = this.config.endpoint || 'http://localhost:11434';
    
    const payload = {
      model: this.config.model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 1000,
      },
      ...(options.system && { system: options.system }),
    };

    const response = await axios.post(
      `${endpoint}/api/generate`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000,
      }
    );

    if (!response.data.response) {
      throw new Error('No response from Ollama');
    }

    return response.data.response;
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

  // NEW: Streaming methods
  async* generateTextStream(prompt: string, options: LLMGenerationOptions & StreamingOptions = {}): AsyncGenerator<StreamChunk, void, unknown> {
    const { onToken, onComplete, onError, ...llmOptions } = options;
    
    try {
      // Implementation will vary based on provider
      switch (this.config.provider) {
        case 'deepseek':
          yield* this.generateStreamWithDeepSeek(prompt, llmOptions, { onToken, onComplete, onError });
          break;
        case 'openai':
          yield* this.generateStreamWithOpenAI(prompt, llmOptions, { onToken, onComplete, onError });
          break;
        case 'huggingface':
          yield* this.generateStreamWithHuggingFace(prompt, llmOptions, { onToken, onComplete, onError });
          break;
        case 'ollama':
          yield* this.generateStreamWithOllama(prompt, llmOptions, { onToken, onComplete, onError });
          break;
        default:
          throw new Error(`Unsupported LLM provider for streaming: ${this.config.provider}`);
      }
    } catch (error) {
      if (onError) {
        onError(error as Error);
      }
      throw error;
    }
  }

  async* createChatCompletionStream(messages: ChatMessage[], options: {
    maxTokens?: number;
    temperature?: number;
  } & StreamingOptions = {}): AsyncGenerator<StreamChunk, void, unknown> {
    // Convert messages to a single prompt for streaming
    const prompt = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n');

    yield* this.generateTextStream(prompt, options);
  }

  // Private streaming implementations
  private async* generateStreamWithOpenAI(prompt: string, options: LLMGenerationOptions, streamingOptions: StreamingOptions): AsyncGenerator<StreamChunk, void, unknown> {
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
      stream: true
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              if (streamingOptions.onComplete) {
                streamingOptions.onComplete(fullContent);
              }
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              
              if (content) {
                fullContent += content;
                
                if (streamingOptions.onToken) {
                  streamingOptions.onToken(content);
                }

                const streamChunk: StreamChunk = {
                  id: parsed.id || 'stream',
                  content: fullContent,
                  done: false,
                  timestamp: new Date(),
                  role: 'assistant'
                };

                yield streamChunk;
              }
            } catch (error) {
              console.warn('Failed to parse stream chunk:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Final chunk
    const finalChunk: StreamChunk = {
      id: 'final',
      content: fullContent,
      done: true,
      timestamp: new Date(),
      role: 'assistant'
    };

    yield finalChunk;
  }

  private async* generateStreamWithDeepSeek(prompt: string, options: LLMGenerationOptions, streamingOptions: StreamingOptions): AsyncGenerator<StreamChunk, void, unknown> {
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
      stream: true
    };

    const response = await fetch(`${this.config.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`DeepSeek API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              if (streamingOptions.onComplete) {
                streamingOptions.onComplete(fullContent);
              }
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content || '';
              
              if (content) {
                fullContent += content;
                
                if (streamingOptions.onToken) {
                  streamingOptions.onToken(content);
                }

                const streamChunk: StreamChunk = {
                  id: parsed.id || 'stream',
                  content: fullContent,
                  done: false,
                  timestamp: new Date(),
                  role: 'assistant'
                };

                yield streamChunk;
              }
            } catch (error) {
              console.warn('Failed to parse stream chunk:', error);
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Final chunk
    const finalChunk: StreamChunk = {
      id: 'final',
      content: fullContent,
      done: true,
      timestamp: new Date(),
      role: 'assistant'
    };

    yield finalChunk;
  }

  private async* generateStreamWithHuggingFace(prompt: string, options: LLMGenerationOptions, streamingOptions: StreamingOptions): AsyncGenerator<StreamChunk, void, unknown> {
    // HuggingFace Inference API doesn't support streaming in the same way
    // So we'll simulate streaming by generating the full response and chunking it
    
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

    const fullText = response.generated_text;
    const words = fullText.split(' ');
    let currentContent = '';

    for (let i = 0; i < words.length; i++) {
      currentContent += (i > 0 ? ' ' : '') + words[i];
      
      if (streamingOptions.onToken) {
        streamingOptions.onToken(words[i] + (i < words.length - 1 ? ' ' : ''));
      }

      const streamChunk: StreamChunk = {
        id: `chunk-${i}`,
        content: currentContent,
        done: i === words.length - 1,
        timestamp: new Date(),
        role: 'assistant'
      };

      yield streamChunk;

      // Small delay to simulate streaming
      if (i < words.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    if (streamingOptions.onComplete) {
      streamingOptions.onComplete(fullText);
    }
  }

  private async* generateStreamWithOllama(prompt: string, options: LLMGenerationOptions, streamingOptions: StreamingOptions): AsyncGenerator<StreamChunk, void, unknown> {
    const endpoint = this.config.endpoint || 'http://localhost:11434';
    
    const payload = {
      model: this.config.model,
      prompt: prompt,
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens || 1000,
      },
      ...(options.system && { system: options.system }),
    };

    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Failed to get response reader');
    }

    const decoder = new TextDecoder();
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const content = parsed.response || '';
            
            if (content) {
              fullContent += content;
              
              if (streamingOptions.onToken) {
                streamingOptions.onToken(content);
              }

              const streamChunk: StreamChunk = {
                id: parsed.id || 'ollama-stream',
                content: fullContent,
                done: parsed.done || false,
                timestamp: new Date(),
                role: 'assistant'
              };

              yield streamChunk;

              if (parsed.done) {
                if (streamingOptions.onComplete) {
                  streamingOptions.onComplete(fullContent);
                }
                return;
              }
            }
          } catch (error) {
            console.warn('Failed to parse Ollama stream chunk:', error);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Final chunk if we didn't get a "done" signal
    const finalChunk: StreamChunk = {
      id: 'final',
      content: fullContent,
      done: true,
      timestamp: new Date(),
      role: 'assistant'
    };

    yield finalChunk;

    if (streamingOptions.onComplete) {
      streamingOptions.onComplete(fullContent);
    }
  }
} 