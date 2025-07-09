import { Tool } from '../types';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

interface VisionConfig {
  ollamaEndpoint?: string;
  chatModel?: string;
  researchModel?: string;
  timeout?: number;
  maxRetries?: number;
  provider?: 'ollama' | 'deepseek' | 'auto';
}

interface VisionAnalysisResult {
  analysis: string;
  objects_detected: string[];
  text_extracted: string;
  scene_description: string;
  technical_details: {
    image_quality: string;
    dominant_colors: string[];
    estimated_resolution: string;
    composition: string;
    lighting: string;
  };
  confidence_score: number;
  research_insights?: {
    historical_context?: string;
    scientific_analysis?: string;
    cultural_significance?: string;
    recommendations?: string[];
  };
  metadata: {
    model_used: string;
    processing_time: number;
    agent_type: 'chat' | 'research';
  };
}

export class VisionAnalysisTool implements Tool {
  name = 'vision_analysis';
  description = 'Analyze images using free vision models - Ollama LLaVA for chat, advanced analysis for research. Supports object detection, OCR, scene understanding, and detailed visual analysis';
  private config: VisionConfig;
  private requestCount = 0;

  constructor(config: VisionConfig = {}) {
    this.config = {
      ollamaEndpoint: process.env.OLLAMA_ENDPOINT || 'http://localhost:11434',
      chatModel: process.env.OLLAMA_MODEL || 'llava:7b',
      researchModel: 'llava:13b', // More powerful model for research
      timeout: 90000,
      maxRetries: 3,
      provider: 'auto', // Auto-detect based on agent type
      ...config,
    };
  }

  async execute(input: {
    action: 'analyze' | 'describe' | 'extract-text' | 'detect-objects' | 'compare-images' | 'technical-analysis' | 'research-analysis';
    imagePath?: string;
    imageUrl?: string;
    imageBase64?: string;
    prompt?: string;
    detailLevel?: 'basic' | 'detailed' | 'technical' | 'research';
    secondImagePath?: string;
    language?: string;
    agentType?: 'chat' | 'research';
    context?: string; // Additional context for research
    focusAreas?: string[]; // Specific areas to focus on
  }): Promise<VisionAnalysisResult> {
    
    const startTime = Date.now();
    const {
      action,
      imagePath,
      imageUrl,
      imageBase64,
      prompt,
      detailLevel = 'detailed',
      secondImagePath,
      language = 'english',
      agentType = 'chat',
      context,
      focusAreas = []
    } = input;

    if (!imagePath && !imageUrl && !imageBase64) {
      throw new Error('Must provide either imagePath, imageUrl, or imageBase64');
    }

    let imageData: string;
    
    // Convert image to base64 if needed
    try {
      if (imageBase64) {
        imageData = imageBase64;
      } else if (imagePath) {
        imageData = await this.imageToBase64(imagePath);
      } else if (imageUrl) {
        imageData = await this.downloadAndConvertImage(imageUrl);
      } else {
        throw new Error('No valid image input provided');
      }
    } catch (error: any) {
      throw new Error(`Failed to process image: ${error.message}`);
    }

    // Select appropriate model based on agent type
    const model = agentType === 'research' ? this.config.researchModel : this.config.chatModel;

    let attempt = 0;
    while (attempt < this.config.maxRetries!) {
      try {
        let result: VisionAnalysisResult;

        switch (action) {
          case 'analyze':
            result = await this.analyzeImage(imageData, detailLevel, language, agentType, context, focusAreas, model!);
            break;
          
          case 'describe':
            result = await this.describeImage(imageData, detailLevel, language, agentType, model!);
            break;
          
          case 'extract-text':
            result = await this.extractText(imageData, language, agentType, model!);
            break;
          
          case 'detect-objects':
            result = await this.detectObjects(imageData, language, agentType, model!);
            break;
          
          case 'compare-images':
            if (!secondImagePath) throw new Error('Second image required for comparison');
            const secondImageData = await this.imageToBase64(secondImagePath);
            result = await this.compareImages(imageData, secondImageData, language, agentType, model!);
            break;
          
          case 'technical-analysis':
            result = await this.technicalAnalysis(imageData, language, agentType, model!);
            break;
          
          case 'research-analysis':
            result = await this.researchAnalysis(imageData, language, context, focusAreas, model!);
            break;
          
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        // Add metadata
        result.metadata = {
          model_used: model!,
          processing_time: Date.now() - startTime,
          agent_type: agentType
        };

        this.requestCount++;
        return result;

      } catch (error: any) {
        attempt++;
        if (attempt >= this.config.maxRetries!) {
          throw new Error(`Vision analysis failed after ${this.config.maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('Vision analysis failed');
  }

  private async analyzeImage(
    imageData: string, 
    detailLevel: string, 
    language: string, 
    agentType: 'chat' | 'research',
    context?: string,
    focusAreas: string[] = [],
    model: string = 'llava:7b'
  ): Promise<VisionAnalysisResult> {
    
    let analysisPrompt = '';
    
    if (agentType === 'chat') {
      analysisPrompt = `Please analyze this image and provide:
1. A brief description of what you see
2. List of main objects detected
3. Any text visible in the image
4. Overall scene assessment
5. Technical observations (lighting, composition, quality)

Respond in ${language}. Keep it conversational and helpful.`;
    } else {
      // Research mode - more detailed analysis
      analysisPrompt = `Conduct a comprehensive research-level analysis of this image:

1. DETAILED SCENE ANALYSIS:
   - Describe everything visible in the image
   - Identify all objects, people, text, symbols
   - Analyze composition, lighting, and technical quality

2. CONTEXTUAL RESEARCH:
   ${context ? `- Consider this context: ${context}` : ''}
   ${focusAreas.length > 0 ? `- Focus particularly on: ${focusAreas.join(', ')}` : ''}
   - Historical or cultural significance if applicable
   - Scientific or technical implications

3. DETAILED EXTRACTION:
   - All visible text (OCR)
   - Objects and their relationships
   - Colors, patterns, styles
   - Possible time period or location

4. RESEARCH INSIGHTS:
   - What can we learn from this image?
   - Are there research opportunities or questions?
   - Recommendations for further investigation

Provide thorough, academic-quality analysis in ${language}.`;
    }

    const response = await this.callOllamaVision(imageData, analysisPrompt, model);
    
    return this.parseAnalysisResponse(response, agentType);
  }

  private async describeImage(
    imageData: string, 
    detailLevel: string, 
    language: string, 
    agentType: 'chat' | 'research',
    model: string
  ): Promise<VisionAnalysisResult> {
    
    const prompt = agentType === 'chat' 
      ? `Describe this image in a ${detailLevel} way. What do you see? Make it engaging and conversational.`
      : `Provide a ${detailLevel} academic description of this image. Include all visual elements, composition, context, and potential significance for research purposes.`;

    const response = await this.callOllamaVision(imageData, prompt, model);
    
    return this.parseAnalysisResponse(response, agentType);
  }

  private async extractText(
    imageData: string, 
    language: string, 
    agentType: 'chat' | 'research',
    model: string
  ): Promise<VisionAnalysisResult> {
    
    const prompt = agentType === 'chat'
      ? `Please extract and transcribe any text you can see in this image. If there's no text, just say so.`
      : `Perform OCR (Optical Character Recognition) on this image. Extract ALL visible text including:
        - Main text content
        - Signs, labels, captions
        - Handwritten text
        - Text in different languages
        - Partially visible or unclear text (indicate uncertainty)
        
        Preserve formatting where possible and note text location/context.`;

    const response = await this.callOllamaVision(imageData, prompt, model);
    
    return this.parseAnalysisResponse(response, agentType);
  }

  private async detectObjects(
    imageData: string, 
    language: string, 
    agentType: 'chat' | 'research',
    model: string
  ): Promise<VisionAnalysisResult> {
    
    const prompt = agentType === 'chat'
      ? `What objects can you identify in this image? List them out for me.`
      : `Perform detailed object detection and classification:
        - Identify ALL visible objects, people, animals, structures
        - Classify by category (person, vehicle, building, nature, etc.)
        - Note object relationships and spatial arrangement
        - Estimate quantities where relevant
        - Identify brands, models, or specific types if recognizable
        - Note any unusual or scientifically interesting objects`;

    const response = await this.callOllamaVision(imageData, prompt, model);
    
    return this.parseAnalysisResponse(response, agentType);
  }

  private async compareImages(
    imageData1: string, 
    imageData2: string, 
    language: string, 
    agentType: 'chat' | 'research',
    model: string
  ): Promise<VisionAnalysisResult> {
    
    // Note: This is a simplified comparison using single image analysis
    // For true comparison, we'd need a multi-image capable model
    const prompt = agentType === 'chat'
      ? `I'm going to show you an image. Please analyze it thoroughly so I can compare it with another image later.`
      : `Analyze this image in detail for comparison purposes. Note all visual elements, composition, objects, text, colors, style, and any distinctive features that would be useful for comparing with another image.`;

    const response = await this.callOllamaVision(imageData1, prompt, model);
    
    // Add comparison note
    const result = this.parseAnalysisResponse(response, agentType);
    result.analysis += '\n\n[Note: Full image comparison requires uploading both images. This analysis is for the first image.]';
    
    return result;
  }

  private async technicalAnalysis(
    imageData: string, 
    language: string, 
    agentType: 'chat' | 'research',
    model: string
  ): Promise<VisionAnalysisResult> {
    
    const prompt = agentType === 'chat'
      ? `Can you analyze the technical aspects of this image? Things like quality, lighting, composition, colors, etc.`
      : `Perform comprehensive technical analysis:
        - Image quality assessment (sharpness, noise, artifacts)
        - Composition analysis (rule of thirds, balance, focal points)
        - Lighting analysis (direction, quality, shadows, highlights)
        - Color analysis (palette, saturation, contrast, temperature)
        - Technical details (apparent resolution, format characteristics)
        - Photographic techniques used
        - Potential camera settings or equipment
        - Post-processing evidence
        - Suitability for different use cases`;

    const response = await this.callOllamaVision(imageData, prompt, model);
    
    return this.parseAnalysisResponse(response, agentType);
  }

  private async researchAnalysis(
    imageData: string, 
    language: string, 
    context?: string,
    focusAreas: string[] = [],
    model: string = 'llava:13b'
  ): Promise<VisionAnalysisResult> {
    
    const prompt = `Conduct a comprehensive research-grade analysis of this image:

ANALYSIS FRAMEWORK:
1. Visual Documentation:
   - Complete scene description
   - Object identification and classification
   - Text extraction (OCR)
   - Technical specifications

2. Contextual Analysis:
   ${context ? `- Research context: ${context}` : ''}
   ${focusAreas.length > 0 ? `- Focus areas: ${focusAreas.join(', ')}` : ''}
   - Historical/temporal context
   - Geographic/cultural context
   - Scientific/technical relevance

3. Research Value Assessment:
   - What research questions does this image raise?
   - What methodology would be needed to study this further?
   - What additional data sources would complement this?
   - Potential applications or implications

4. Quality and Reliability:
   - Image authenticity assessment
   - Data quality evaluation
   - Limitations and biases
   - Confidence levels

Provide academic-level analysis with specific, actionable insights for researchers.`;

    const response = await this.callOllamaVision(imageData, prompt, model);
    
    const result = this.parseAnalysisResponse(response, 'research');
    
    // Add research-specific insights
    result.research_insights = {
      historical_context: 'Requires additional analysis',
      scientific_analysis: 'See detailed analysis above',
      cultural_significance: 'Context-dependent',
      recommendations: ['Further image analysis', 'Cross-reference with databases', 'Expert consultation']
    };
    
    return result;
  }

  private async callOllamaVision(imageData: string, prompt: string, model: string): Promise<string> {
    try {
      const response = await axios.post(
        `${this.config.ollamaEndpoint}/api/generate`,
        {
          model: model,
          prompt: prompt,
          images: [imageData],
          stream: false,
          options: {
            temperature: 0.3, // Lower temperature for more consistent analysis
            num_predict: 2000, // Allow longer responses
          }
        },
        {
          timeout: this.config.timeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.data?.response) {
        throw new Error('No response from Ollama vision model');
      }

      return response.data.response;
    } catch (error: any) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to Ollama at ${this.config.ollamaEndpoint}. Please ensure Ollama is running and the vision model (${model}) is installed.`);
      }
      throw new Error(`Ollama vision analysis failed: ${error.message}`);
    }
  }

  private parseAnalysisResponse(response: string, agentType: 'chat' | 'research'): VisionAnalysisResult {
    // Extract structured information from the response
    const objects = this.extractObjects(response);
    const textContent = this.extractText(response);
    const technicalDetails = this.extractTechnicalDetails(response);
    
    return {
      analysis: response,
      objects_detected: objects,
      text_extracted: textContent,
      scene_description: this.extractSceneDescription(response),
      technical_details: technicalDetails,
      confidence_score: this.estimateConfidence(response),
      ...(agentType === 'research' && {
        research_insights: {
          historical_context: this.extractHistoricalContext(response),
          scientific_analysis: this.extractScientificAnalysis(response),
          cultural_significance: this.extractCulturalSignificance(response),
          recommendations: this.extractRecommendations(response)
        }
      }),
      metadata: {
        model_used: '',
        processing_time: 0,
        agent_type: agentType
      }
    };
  }

  private extractObjects(response: string): string[] {
    // Simple regex patterns to extract object mentions
    const objectPatterns = [
      /objects?[:\s]+([^.!?]+)/gi,
      /(?:see|visible|shows?)[:\s]+([^.!?]+)/gi,
      /(?:contains?|includes?)[:\s]+([^.!?]+)/gi
    ];
    
    const objects: string[] = [];
    objectPatterns.forEach(pattern => {
      const matches = response.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const items = match.split(/[,;]/).map(item => item.trim().toLowerCase());
          objects.push(...items);
        });
      }
    });
    
    return [...new Set(objects)].filter(obj => obj.length > 2);
  }

  private extractText(response: string): string {
    // Extract text content mentions
    const textPatterns = [
      /text[:\s]+"([^"]+)"/gi,
      /reads?[:\s]+"([^"]+)"/gi,
      /says?[:\s]+"([^"]+)"/gi
    ];
    
    const texts: string[] = [];
    textPatterns.forEach(pattern => {
      const matches = [...response.matchAll(pattern)];
      matches.forEach(match => texts.push(match[1]));
    });
    
    return texts.join(' | ');
  }

  private extractSceneDescription(response: string): string {
    // Extract the main scene description (usually first paragraph)
    const sentences = response.split(/[.!?]+/);
    return sentences.slice(0, 3).join('. ').trim();
  }

  private extractTechnicalDetails(response: string): any {
    return {
      image_quality: this.extractQuality(response),
      dominant_colors: this.extractColors(response),
      estimated_resolution: this.extractResolution(response),
      composition: this.extractComposition(response),
      lighting: this.extractLighting(response)
    };
  }

  private extractQuality(response: string): string {
    const qualityWords = ['high quality', 'low quality', 'good quality', 'poor quality', 'sharp', 'blurry', 'clear', 'crisp'];
    for (const word of qualityWords) {
      if (response.toLowerCase().includes(word)) {
        return word;
      }
    }
    return 'unknown';
  }

  private extractColors(response: string): string[] {
    const colorPattern = /(?:blue|red|green|yellow|purple|orange|pink|brown|black|white|gray|grey)\w*/gi;
    const matches = response.match(colorPattern) || [];
    return [...new Set(matches.map(color => color.toLowerCase()))];
  }

  private extractResolution(response: string): string {
    const resPattern = /\d+x\d+|\d+\s*(?:mp|megapixels?)|high.?res|low.?res/gi;
    const match = response.match(resPattern);
    return match ? match[0] : 'unknown';
  }

  private extractComposition(response: string): string {
    const compWords = ['centered', 'balanced', 'symmetrical', 'rule of thirds', 'diagonal', 'vertical', 'horizontal'];
    for (const word of compWords) {
      if (response.toLowerCase().includes(word)) {
        return word;
      }
    }
    return 'unknown';
  }

  private extractLighting(response: string): string {
    const lightWords = ['bright', 'dark', 'natural light', 'artificial light', 'soft light', 'harsh light', 'backlit', 'front lit'];
    for (const word of lightWords) {
      if (response.toLowerCase().includes(word)) {
        return word;
      }
    }
    return 'unknown';
  }

  private extractHistoricalContext(response: string): string {
    // Extract historical context mentions
    const historyPatterns = [
      /historical[ly]?[:\s]+([^.!?]+)/gi,
      /(?:era|period|time)[:\s]+([^.!?]+)/gi
    ];
    
    for (const pattern of historyPatterns) {
      const match = response.match(pattern);
      if (match) return match[0];
    }
    return 'No historical context identified';
  }

  private extractScientificAnalysis(response: string): string {
    // Extract scientific observations
    const sciencePatterns = [
      /scientific[ally]?[:\s]+([^.!?]+)/gi,
      /research[:\s]+([^.!?]+)/gi
    ];
    
    for (const pattern of sciencePatterns) {
      const match = response.match(pattern);
      if (match) return match[0];
    }
    return 'See main analysis for scientific observations';
  }

  private extractCulturalSignificance(response: string): string {
    // Extract cultural context
    const culturePatterns = [
      /cultural[ly]?[:\s]+([^.!?]+)/gi,
      /tradition[al]?[:\s]+([^.!?]+)/gi
    ];
    
    for (const pattern of culturePatterns) {
      const match = response.match(pattern);
      if (match) return match[0];
    }
    return 'Cultural significance requires additional analysis';
  }

  private extractRecommendations(response: string): string[] {
    // Extract recommendation-like statements
    const recommendations = [];
    
    if (response.toLowerCase().includes('recommend')) {
      recommendations.push('Further analysis recommended');
    }
    if (response.toLowerCase().includes('research')) {
      recommendations.push('Research potential identified');
    }
    if (response.toLowerCase().includes('study')) {
      recommendations.push('Additional study suggested');
    }
    
    return recommendations.length > 0 ? recommendations : ['No specific recommendations identified'];
  }

  private estimateConfidence(response: string): number {
    // Simple confidence estimation based on response characteristics
    let confidence = 0.5; // Base confidence
    
    if (response.length > 200) confidence += 0.1;
    if (response.includes('clearly') || response.includes('obviously')) confidence += 0.1;
    if (response.includes('appears') || response.includes('seems')) confidence -= 0.1;
    if (response.includes('uncertain') || response.includes('unclear')) confidence -= 0.2;
    if (response.includes('definitely') || response.includes('certainly')) confidence += 0.2;
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private async imageToBase64(imagePath: string): Promise<string> {
    try {
      if (!fs.existsSync(imagePath)) {
        throw new Error(`Image file not found: ${imagePath}`);
      }
      
      const imageBuffer = fs.readFileSync(imagePath);
      return imageBuffer.toString('base64');
    } catch (error: any) {
      throw new Error(`Failed to convert image to base64: ${error.message}`);
    }
  }

  private async downloadAndConvertImage(imageUrl: string): Promise<string> {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'AI-Research-Agent/1.0'
        }
      });
      
      const imageBuffer = Buffer.from(response.data);
      return imageBuffer.toString('base64');
    } catch (error: any) {
      throw new Error(`Failed to download image: ${error.message}`);
    }
  }

  // Utility methods for integration
  async analyzeImageForChat(imagePath: string, prompt?: string): Promise<{
    description: string;
    objects: string[];
    text: string;
  }> {
    const result = await this.execute({
      action: 'analyze',
      imagePath,
      prompt,
      agentType: 'chat',
      detailLevel: 'basic'
    });

    return {
      description: result.scene_description,
      objects: result.objects_detected,
      text: result.text_extracted
    };
  }

  async analyzeImageForResearch(imagePath: string, context?: string, focusAreas?: string[]): Promise<VisionAnalysisResult> {
    return await this.execute({
      action: 'research-analysis',
      imagePath,
      agentType: 'research',
      detailLevel: 'research',
      context,
      focusAreas
    });
  }

  getToolMetrics(): {
    provider: string;
    requestCount: number;
    supportsOCR: boolean;
    supportsObjectDetection: boolean;
    supportsComparison: boolean;
    supportsChatMode: boolean;
    supportsResearchMode: boolean;
    modelsAvailable: string[];
  } {
    return {
      provider: 'Ollama LLaVA',
      requestCount: this.requestCount,
      supportsOCR: true,
      supportsObjectDetection: true,
      supportsComparison: true,
      supportsChatMode: true,
      supportsResearchMode: true,
      modelsAvailable: [this.config.chatModel!, this.config.researchModel!]
    };
  }

  async health(): Promise<{
    status: string;
    responseTime: number;
    modelStatus: Record<string, boolean>;
  }> {
    const start = Date.now();
    
    try {
      // Test basic connection to Ollama
      const response = await axios.get(`${this.config.ollamaEndpoint}/api/tags`, {
        timeout: 5000
      });
      
      const modelStatus: Record<string, boolean> = {};
      
      // Check if vision models are available
      if (response.data?.models) {
        const availableModels = response.data.models.map((m: any) => m.name);
        modelStatus[this.config.chatModel!] = availableModels.includes(this.config.chatModel);
        modelStatus[this.config.researchModel!] = availableModels.includes(this.config.researchModel);
      }

      return {
        status: 'healthy',
        responseTime: Date.now() - start,
        modelStatus
      };
    } catch (error: any) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        modelStatus: {}
      };
    }
  }
} 