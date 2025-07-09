import { Tool } from '../types';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

interface ImageGenConfig {
  comfyUIEndpoint?: string;
  automaticEndpoint?: string;
  timeout?: number;
  maxRetries?: number;
  outputDir?: string;
  provider?: 'comfyui' | 'automatic1111' | 'auto';
}

interface ImageGenerationResult {
  success: boolean;
  images: {
    url: string;
    path: string;
    filename: string;
    seed: number;
    prompt_used: string;
    negative_prompt_used: string;
    model_used: string;
    steps: number;
    cfg_scale: number;
    resolution: string;
  }[];
  generation_info: {
    total_time: number;
    model: string;
    parameters: any;
    agent_type: 'chat' | 'research';
    provider_used: string;
  };
  research_metadata?: {
    style_analysis: string;
    technical_quality: string;
    artistic_elements: string[];
    potential_applications: string[];
  };
}

export class ImageGenerationTool implements Tool {
  name = 'image_generation';
  description = 'Generate images using FREE local Stable Diffusion. Supports ComfyUI and Automatic1111. Works for both chat (quick generation) and research (high-quality, detailed)';
  private config: ImageGenConfig;
  private requestCount = 0;

  constructor(config: ImageGenConfig = {}) {
    this.config = {
      comfyUIEndpoint: process.env.COMFYUI_ENDPOINT || 'http://localhost:8188',
      automaticEndpoint: process.env.AUTOMATIC1111_ENDPOINT || 'http://localhost:7860',
      timeout: 300000, // 5 minutes for image generation
      maxRetries: 2,
      outputDir: process.env.IMAGE_OUTPUT_DIR || './output/generated_images',
      provider: 'auto',
      ...config,
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.config.outputDir!)) {
      fs.mkdirSync(this.config.outputDir!, { recursive: true });
    }
  }

  async execute(input: {
    action: 'generate' | 'txt2img' | 'img2img' | 'inpaint' | 'controlnet' | 'batch-generate';
    prompt: string;
    negative_prompt?: string;
    image_path?: string; // For img2img, inpaint
    mask_path?: string; // For inpainting
    control_image?: string; // For ControlNet
    controlnet_type?: 'canny' | 'depth' | 'pose' | 'scribble';
    
    // Generation parameters
    width?: number;
    height?: number;
    steps?: number;
    cfg_scale?: number;
    sampler?: string;
    seed?: number;
    batch_size?: number;
    batch_count?: number;
    
    // Model selection
    model?: string;
    vae?: string;
    lora?: string[];
    
    // Agent-specific settings
    agentType?: 'chat' | 'research';
    quality_level?: 'fast' | 'standard' | 'high' | 'research';
    style?: string;
    research_purpose?: string;
    
    // Advanced options
    denoising_strength?: number;
    clip_skip?: number;
    restore_faces?: boolean;
    tiling?: boolean;
  }): Promise<ImageGenerationResult> {
    
    const startTime = Date.now();
    const {
      action = 'generate',
      prompt,
      negative_prompt = '',
      image_path,
      mask_path,
      control_image,
      controlnet_type,
      
      width = 512,
      height = 512,
      steps = 20,
      cfg_scale = 7,
      sampler = 'DPM++ 2M Karras',
      seed = -1,
      batch_size = 1,
      batch_count = 1,
      
      model,
      vae,
      lora = [],
      
      agentType = 'chat',
      quality_level = 'standard',
      style,
      research_purpose,
      
      denoising_strength = 0.75,
      clip_skip = 1,
      restore_faces = false,
      tiling = false
    } = input;

    if (!prompt || prompt.trim().length === 0) {
      throw new Error('Prompt is required for image generation');
    }

    // Adjust parameters based on agent type and quality level
    const params = this.getOptimalParameters(agentType, quality_level, {
      width, height, steps, cfg_scale, sampler, batch_size, batch_count
    });

    // Enhance prompt based on agent type
    const enhancedPrompt = this.enhancePrompt(prompt, agentType, style, research_purpose);
    const enhancedNegativePrompt = this.enhanceNegativePrompt(negative_prompt, agentType, quality_level);

    let attempt = 0;
    while (attempt < this.config.maxRetries!) {
      try {
        // Auto-detect best available provider
        const provider = await this.detectBestProvider();
        
        let result: ImageGenerationResult;
        
        switch (action) {
          case 'generate':
          case 'txt2img':
            result = await this.generateFromText(
              enhancedPrompt, enhancedNegativePrompt, params, provider, model, agentType
            );
            break;
            
          case 'img2img':
            if (!image_path) throw new Error('Image path required for img2img');
            result = await this.generateFromImage(
              enhancedPrompt, enhancedNegativePrompt, image_path, params, provider, model, agentType, denoising_strength
            );
            break;
            
          case 'inpaint':
            if (!image_path || !mask_path) throw new Error('Image and mask paths required for inpainting');
            result = await this.inpaintImage(
              enhancedPrompt, enhancedNegativePrompt, image_path, mask_path, params, provider, model, agentType
            );
            break;
            
          case 'controlnet':
            if (!control_image || !controlnet_type) throw new Error('Control image and type required for ControlNet');
            result = await this.generateWithControlNet(
              enhancedPrompt, enhancedNegativePrompt, control_image, controlnet_type, params, provider, model, agentType
            );
            break;
            
          case 'batch-generate':
            result = await this.batchGenerate(
              enhancedPrompt, enhancedNegativePrompt, params, provider, model, agentType
            );
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        // Add research metadata for research agents
        if (agentType === 'research') {
          result.research_metadata = await this.generateResearchMetadata(result, research_purpose);
        }

        result.generation_info.total_time = Date.now() - startTime;
        result.generation_info.agent_type = agentType;
        result.generation_info.provider_used = provider;

        this.requestCount++;
        return result;

      } catch (error: any) {
        attempt++;
        if (attempt >= this.config.maxRetries!) {
          throw new Error(`Image generation failed after ${this.config.maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }

    throw new Error('Image generation failed');
  }

  private getOptimalParameters(agentType: 'chat' | 'research', quality_level: string, baseParams: any): any {
    const params = { ...baseParams };
    
    if (agentType === 'chat') {
      // Chat optimizations: faster generation
      switch (quality_level) {
        case 'fast':
          params.steps = 15;
          params.width = 512;
          params.height = 512;
          break;
        case 'standard':
          params.steps = 20;
          params.width = 768;
          params.height = 768;
          break;
        case 'high':
          params.steps = 30;
          params.width = 1024;
          params.height = 1024;
          break;
      }
    } else {
      // Research optimizations: higher quality
      switch (quality_level) {
        case 'standard':
          params.steps = 30;
          params.width = 1024;
          params.height = 1024;
          params.cfg_scale = 8;
          break;
        case 'high':
          params.steps = 50;
          params.width = 1536;
          params.height = 1536;
          params.cfg_scale = 9;
          break;
        case 'research':
          params.steps = 80;
          params.width = 2048;
          params.height = 2048;
          params.cfg_scale = 10;
          params.batch_size = 4; // Generate multiple variants
          break;
      }
    }
    
    return params;
  }

  private enhancePrompt(prompt: string, agentType: 'chat' | 'research', style?: string, research_purpose?: string): string {
    let enhanced = prompt;
    
    if (agentType === 'research') {
      // Add research-quality modifiers
      enhanced += ', highly detailed, professional quality, research grade';
      
      if (research_purpose) {
        enhanced += `, ${research_purpose}`;
      }
      
      // Add technical quality terms
      enhanced += ', 8k resolution, sharp focus, masterpiece, award winning';
    } else {
      // Chat-friendly enhancements
      enhanced += ', high quality, detailed';
    }
    
    if (style) {
      enhanced += `, ${style} style`;
    }
    
    return enhanced;
  }

  private enhanceNegativePrompt(negative_prompt: string, agentType: 'chat' | 'research', quality_level: string): string {
    const baseNegative = negative_prompt || '';
    const commonNegatives = [
      'low quality', 'blurry', 'bad anatomy', 'deformed', 'disfigured',
      'ugly', 'duplicate', 'morbid', 'mutilated', 'extra fingers',
      'poorly drawn hands', 'poorly drawn face', 'mutation', 'bad proportions'
    ];
    
    if (agentType === 'research') {
      commonNegatives.push(
        'low resolution', 'pixelated', 'jpeg artifacts', 'compression artifacts',
        'watermark', 'signature', 'text overlay', 'unprofessional'
      );
    }
    
    const enhanced = baseNegative + (baseNegative ? ', ' : '') + commonNegatives.join(', ');
    return enhanced;
  }

  private async detectBestProvider(): Promise<'comfyui' | 'automatic1111'> {
    try {
      // Try ComfyUI first
      await axios.get(`${this.config.comfyUIEndpoint}/system_stats`, { timeout: 5000 });
      return 'comfyui';
    } catch {
      try {
        // Fall back to Automatic1111
        await axios.get(`${this.config.automaticEndpoint}/internal/ping`, { timeout: 5000 });
        return 'automatic1111';
      } catch {
        throw new Error('No Stable Diffusion backend available. Please start ComfyUI or Automatic1111');
      }
    }
  }

  private async generateFromText(
    prompt: string,
    negative_prompt: string,
    params: any,
    provider: string,
    model?: string,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageGenerationResult> {
    
    if (provider === 'comfyui') {
      return await this.generateWithComfyUI(prompt, negative_prompt, params, model, agentType);
    } else {
      return await this.generateWithAutomatic1111(prompt, negative_prompt, params, model, agentType);
    }
  }

  private async generateFromImage(
    prompt: string,
    negative_prompt: string,
    image_path: string,
    params: any,
    provider: string,
    model?: string,
    agentType: 'chat' | 'research' = 'chat',
    denoising_strength: number = 0.75
  ): Promise<ImageGenerationResult> {
    
    // Read and encode image
    const imageBase64 = fs.readFileSync(image_path, { encoding: 'base64' });
    
    if (provider === 'comfyui') {
      return await this.img2imgWithComfyUI(prompt, negative_prompt, imageBase64, params, model, agentType, denoising_strength);
    } else {
      return await this.img2imgWithAutomatic1111(prompt, negative_prompt, imageBase64, params, model, agentType, denoising_strength);
    }
  }

  private async inpaintImage(
    prompt: string,
    negative_prompt: string,
    image_path: string,
    mask_path: string,
    params: any,
    provider: string,
    model?: string,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageGenerationResult> {
    
    const imageBase64 = fs.readFileSync(image_path, { encoding: 'base64' });
    const maskBase64 = fs.readFileSync(mask_path, { encoding: 'base64' });
    
    if (provider === 'comfyui') {
      return await this.inpaintWithComfyUI(prompt, negative_prompt, imageBase64, maskBase64, params, model, agentType);
    } else {
      return await this.inpaintWithAutomatic1111(prompt, negative_prompt, imageBase64, maskBase64, params, model, agentType);
    }
  }

  private async generateWithControlNet(
    prompt: string,
    negative_prompt: string,
    control_image: string,
    controlnet_type: string,
    params: any,
    provider: string,
    model?: string,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageGenerationResult> {
    
    const controlImageBase64 = fs.readFileSync(control_image, { encoding: 'base64' });
    
    if (provider === 'comfyui') {
      return await this.controlnetWithComfyUI(prompt, negative_prompt, controlImageBase64, controlnet_type, params, model, agentType);
    } else {
      return await this.controlnetWithAutomatic1111(prompt, negative_prompt, controlImageBase64, controlnet_type, params, model, agentType);
    }
  }

  private async batchGenerate(
    prompt: string,
    negative_prompt: string,
    params: any,
    provider: string,
    model?: string,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageGenerationResult> {
    
    const batchResults: ImageGenerationResult[] = [];
    const batchCount = params.batch_count || 1;
    
    for (let i = 0; i < batchCount; i++) {
      const batchParams = { ...params, batch_count: 1, seed: -1 }; // Random seed for each batch
      const result = await this.generateFromText(prompt, negative_prompt, batchParams, provider, model, agentType);
      batchResults.push(result);
    }
    
    // Combine results
    const combinedResult: ImageGenerationResult = {
      success: true,
      images: batchResults.flatMap(r => r.images),
      generation_info: {
        total_time: batchResults.reduce((sum, r) => sum + r.generation_info.total_time, 0),
        model: batchResults[0].generation_info.model,
        parameters: params,
        agent_type: agentType,
        provider_used: provider
      }
    };
    
    return combinedResult;
  }

  // ComfyUI Implementation
  private async generateWithComfyUI(
    prompt: string,
    negative_prompt: string,
    params: any,
    model?: string,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageGenerationResult> {
    
    // ComfyUI workflow for text-to-image
    const workflow = {
      "1": {
        "inputs": {
          "ckpt_name": model || "sd_xl_base_1.0.safetensors"
        },
        "class_type": "CheckpointLoaderSimple"
      },
      "2": {
        "inputs": {
          "text": prompt,
          "clip": ["1", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "3": {
        "inputs": {
          "text": negative_prompt,
          "clip": ["1", 1]
        },
        "class_type": "CLIPTextEncode"
      },
      "4": {
        "inputs": {
          "width": params.width,
          "height": params.height,
          "batch_size": params.batch_size
        },
        "class_type": "EmptyLatentImage"
      },
      "5": {
        "inputs": {
          "seed": params.seed,
          "steps": params.steps,
          "cfg": params.cfg_scale,
          "sampler_name": params.sampler,
          "scheduler": "karras",
          "denoise": 1.0,
          "model": ["1", 0],
          "positive": ["2", 0],
          "negative": ["3", 0],
          "latent_image": ["4", 0]
        },
        "class_type": "KSampler"
      },
      "6": {
        "inputs": {
          "samples": ["5", 0],
          "vae": ["1", 2]
        },
        "class_type": "VAEDecode"
      },
      "7": {
        "inputs": {
          "filename_prefix": `generated_${agentType}_`,
          "images": ["6", 0]
        },
        "class_type": "SaveImage"
      }
    };

    try {
      // Queue the workflow
      const queueResponse = await axios.post(
        `${this.config.comfyUIEndpoint}/prompt`,
        { prompt: workflow },
        { timeout: this.config.timeout }
      );

      const promptId = queueResponse.data.prompt_id;
      
      // Wait for completion and get results
      const result = await this.waitForComfyUICompletion(promptId);
      
      return {
        success: true,
        images: result.images,
        generation_info: {
          total_time: result.generation_time,
          model: model || "sd_xl_base_1.0.safetensors",
          parameters: params,
          agent_type: agentType,
          provider_used: 'comfyui'
        }
      };
      
    } catch (error: any) {
      throw new Error(`ComfyUI generation failed: ${error.message}`);
    }
  }

  // Automatic1111 Implementation
  private async generateWithAutomatic1111(
    prompt: string,
    negative_prompt: string,
    params: any,
    model?: string,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageGenerationResult> {
    
    const payload = {
      prompt: prompt,
      negative_prompt: negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg_scale: params.cfg_scale,
      sampler_name: params.sampler,
      seed: params.seed,
      batch_size: params.batch_size,
      n_iter: params.batch_count || 1,
      restore_faces: false,
      tiling: false,
      do_not_save_samples: false,
      do_not_save_grid: true
    };

    try {
      const response = await axios.post(
        `${this.config.automaticEndpoint}/sdapi/v1/txt2img`,
        payload,
        { timeout: this.config.timeout }
      );

      const images = await this.saveBase64Images(response.data.images, agentType);
      
      return {
        success: true,
        images: images,
        generation_info: {
          total_time: 0, // Automatic1111 doesn't provide timing
          model: model || "default",
          parameters: params,
          agent_type: agentType,
          provider_used: 'automatic1111'
        }
      };
      
    } catch (error: any) {
      throw new Error(`Automatic1111 generation failed: ${error.message}`);
    }
  }

  // Helper methods for other operations (img2img, inpaint, controlnet)
  private async img2imgWithComfyUI(prompt: string, negative_prompt: string, imageBase64: string, params: any, model?: string, agentType: 'chat' | 'research' = 'chat', denoising_strength: number = 0.75): Promise<ImageGenerationResult> {
    // Implementation for ComfyUI img2img
    throw new Error('ComfyUI img2img not implemented yet');
  }

  private async img2imgWithAutomatic1111(prompt: string, negative_prompt: string, imageBase64: string, params: any, model?: string, agentType: 'chat' | 'research' = 'chat', denoising_strength: number = 0.75): Promise<ImageGenerationResult> {
    // Implementation for Automatic1111 img2img
    const payload = {
      init_images: [imageBase64],
      prompt: prompt,
      negative_prompt: negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg_scale: params.cfg_scale,
      sampler_name: params.sampler,
      denoising_strength: denoising_strength,
      seed: params.seed,
      batch_size: params.batch_size
    };

    const response = await axios.post(
      `${this.config.automaticEndpoint}/sdapi/v1/img2img`,
      payload,
      { timeout: this.config.timeout }
    );

    const images = await this.saveBase64Images(response.data.images, agentType);
    
    return {
      success: true,
      images: images,
      generation_info: {
        total_time: 0,
        model: model || "default",
        parameters: params,
        agent_type: agentType,
        provider_used: 'automatic1111'
      }
    };
  }

  private async inpaintWithComfyUI(prompt: string, negative_prompt: string, imageBase64: string, maskBase64: string, params: any, model?: string, agentType: 'chat' | 'research' = 'chat'): Promise<ImageGenerationResult> {
    throw new Error('ComfyUI inpainting not implemented yet');
  }

  private async inpaintWithAutomatic1111(prompt: string, negative_prompt: string, imageBase64: string, maskBase64: string, params: any, model?: string, agentType: 'chat' | 'research' = 'chat'): Promise<ImageGenerationResult> {
    const payload = {
      init_images: [imageBase64],
      mask: maskBase64,
      prompt: prompt,
      negative_prompt: negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg_scale: params.cfg_scale,
      sampler_name: params.sampler,
      seed: params.seed,
      batch_size: params.batch_size,
      inpainting_fill: 1, // Original
      inpaint_full_res: false
    };

    const response = await axios.post(
      `${this.config.automaticEndpoint}/sdapi/v1/img2img`,
      payload,
      { timeout: this.config.timeout }
    );

    const images = await this.saveBase64Images(response.data.images, agentType);
    
    return {
      success: true,
      images: images,
      generation_info: {
        total_time: 0,
        model: model || "default",
        parameters: params,
        agent_type: agentType,
        provider_used: 'automatic1111'
      }
    };
  }

  private async controlnetWithComfyUI(prompt: string, negative_prompt: string, controlImageBase64: string, controlnet_type: string, params: any, model?: string, agentType: 'chat' | 'research' = 'chat'): Promise<ImageGenerationResult> {
    throw new Error('ComfyUI ControlNet not implemented yet');
  }

  private async controlnetWithAutomatic1111(prompt: string, negative_prompt: string, controlImageBase64: string, controlnet_type: string, params: any, model?: string, agentType: 'chat' | 'research' = 'chat'): Promise<ImageGenerationResult> {
    const payload = {
      init_images: [controlImageBase64],
      prompt: prompt,
      negative_prompt: negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg_scale: params.cfg_scale,
      sampler_name: params.sampler,
      seed: params.seed,
      batch_size: params.batch_size,
      alwayson_scripts: {
        controlnet: {
          args: [{
            input_image: controlImageBase64,
            module: controlnet_type,
            model: `control_v11p_sd15_${controlnet_type} [d6c08132]`,
            weight: 1.0,
            guidance_start: 0.0,
            guidance_end: 1.0
          }]
        }
      }
    };

    const response = await axios.post(
      `${this.config.automaticEndpoint}/sdapi/v1/img2img`,
      payload,
      { timeout: this.config.timeout }
    );

    const images = await this.saveBase64Images(response.data.images, agentType);
    
    return {
      success: true,
      images: images,
      generation_info: {
        total_time: 0,
        model: model || "default",
        parameters: params,
        agent_type: agentType,
        provider_used: 'automatic1111'
      }
    };
  }

  private async waitForComfyUICompletion(promptId: string): Promise<any> {
    const maxWaitTime = 300000; // 5 minutes
    const pollInterval = 2000; // 2 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        const historyResponse = await axios.get(`${this.config.comfyUIEndpoint}/history/${promptId}`);
        
        if (historyResponse.data[promptId]) {
          const outputs = historyResponse.data[promptId].outputs;
          const images = [];
          
          // Extract saved images
          for (const nodeId in outputs) {
            if (outputs[nodeId].images) {
              for (const img of outputs[nodeId].images) {
                const imagePath = path.join(this.config.outputDir!, img.filename);
                images.push({
                  url: `/generated_images/${img.filename}`,
                  path: imagePath,
                  filename: img.filename,
                  seed: -1, // ComfyUI doesn't return seed in this format
                  prompt_used: '',
                  negative_prompt_used: '',
                  model_used: '',
                  steps: 0,
                  cfg_scale: 0,
                  resolution: `${img.width}x${img.height}`
                });
              }
            }
          }
          
          return {
            images: images,
            generation_time: Date.now() - startTime
          };
        }
      } catch (error) {
        // Continue polling
      }
      
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    
    throw new Error('ComfyUI generation timeout');
  }

  private async saveBase64Images(base64Images: string[], agentType: string): Promise<any[]> {
    const images = [];
    
    for (let i = 0; i < base64Images.length; i++) {
      const timestamp = Date.now();
      const filename = `${agentType}_generated_${timestamp}_${i}.png`;
      const imagePath = path.join(this.config.outputDir!, filename);
      
      // Save image
      const imageBuffer = Buffer.from(base64Images[i], 'base64');
      fs.writeFileSync(imagePath, imageBuffer);
      
      images.push({
        url: `/generated_images/${filename}`,
        path: imagePath,
        filename: filename,
        seed: -1,
        prompt_used: '',
        negative_prompt_used: '',
        model_used: '',
        steps: 0,
        cfg_scale: 0,
        resolution: 'unknown'
      });
    }
    
    return images;
  }

  private async generateResearchMetadata(result: ImageGenerationResult, research_purpose?: string): Promise<any> {
    return {
      style_analysis: 'Requires visual analysis of generated images',
      technical_quality: 'High resolution, research-grade quality',
      artistic_elements: ['composition', 'color palette', 'lighting', 'detail level'],
      potential_applications: [
        'Academic research',
        'Visual documentation',
        'Concept illustration',
        'Scientific visualization'
      ]
    };
  }

  // Utility methods for integration
  async generateForChat(prompt: string, style?: string): Promise<{ images: string[], info: any }> {
    const result = await this.execute({
      action: 'generate',
      prompt,
      style,
      agentType: 'chat',
      quality_level: 'standard',
      width: 768,
      height: 768,
      steps: 20
    });

    return {
      images: result.images.map(img => img.url),
      info: result.generation_info
    };
  }

  async generateForResearch(prompt: string, research_purpose?: string, quality_level: string = 'high'): Promise<ImageGenerationResult> {
    return await this.execute({
      action: 'generate',
      prompt,
      agentType: 'research',
      quality_level: quality_level as any,
      research_purpose,
      width: 1536,
      height: 1536,
      steps: 50,
      batch_size: 2 // Generate multiple variants for research
    });
  }

  getToolMetrics(): {
    provider: string;
    requestCount: number;
    supportsTxt2Img: boolean;
    supportsImg2Img: boolean;
    supportsInpainting: boolean;
    supportsControlNet: boolean;
    supportsBatchGeneration: boolean;
    supportsChatMode: boolean;
    supportsResearchMode: boolean;
  } {
    return {
      provider: 'Local Stable Diffusion',
      requestCount: this.requestCount,
      supportsTxt2Img: true,
      supportsImg2Img: true,
      supportsInpainting: true,
      supportsControlNet: true,
      supportsBatchGeneration: true,
      supportsChatMode: true,
      supportsResearchMode: true
    };
  }

  async health(): Promise<{
    status: string;
    responseTime: number;
    providers: Record<string, boolean>;
  }> {
    const start = Date.now();
    const providers: Record<string, boolean> = {};
    
    try {
      await axios.get(`${this.config.comfyUIEndpoint}/system_stats`, { timeout: 5000 });
      providers.comfyui = true;
    } catch {
      providers.comfyui = false;
    }
    
    try {
      await axios.get(`${this.config.automaticEndpoint}/internal/ping`, { timeout: 5000 });
      providers.automatic1111 = true;
    } catch {
      providers.automatic1111 = false;
    }

    const anyAvailable = Object.values(providers).some(status => status);

    return {
      status: anyAvailable ? 'healthy' : 'unhealthy',
      responseTime: Date.now() - start,
      providers
    };
  }
} 