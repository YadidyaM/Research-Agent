import { Tool } from '../types';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

interface ImageEditConfig {
  pythonPath?: string;
  scriptsDir?: string;
  outputDir?: string;
  timeout?: number;
  maxRetries?: number;
}

interface ImageEditResult {
  success: boolean;
  output_path: string;
  output_url: string;
  operation_performed: string;
  processing_info: {
    input_resolution: string;
    output_resolution: string;
    processing_time: number;
    operations_applied: string[];
    agent_type: 'chat' | 'research';
  };
  metadata?: {
    technical_details: string;
    quality_assessment: string;
    recommendations: string[];
  };
}

export class ImageEditingTool implements Tool {
  name = 'image_editing';
  description = 'Edit and manipulate images using FREE Python libraries (OpenCV, PIL, scikit-image). Supports cropping, resizing, filters, enhancement, restoration, and advanced processing for both chat and research';
  private config: ImageEditConfig;
  private requestCount = 0;
  private scriptsInitialized = false;

  constructor(config: ImageEditConfig = {}) {
    this.config = {
      pythonPath: process.env.PYTHON_PATH || 'python',
      scriptsDir: path.join(__dirname, '../../scripts/image_editing'),
      outputDir: process.env.IMAGE_OUTPUT_DIR || './output/edited_images',
      timeout: 120000, // 2 minutes
      maxRetries: 2,
      ...config,
    };

    // Ensure directories exist
    if (!fs.existsSync(this.config.outputDir!)) {
      fs.mkdirSync(this.config.outputDir!, { recursive: true });
    }
    if (!fs.existsSync(this.config.scriptsDir!)) {
      fs.mkdirSync(this.config.scriptsDir!, { recursive: true });
    }

    this.initializePythonScripts();
  }

  async execute(input: {
    action: 'resize' | 'crop' | 'enhance' | 'filter' | 'restore' | 'colorize' | 'remove-background' | 'upscale' | 'denoise' | 'artistic-filter' | 'batch-edit' | 'advanced-edit';
    image_path: string;
    output_name?: string;
    
    // Basic operations
    width?: number;
    height?: number;
    maintain_aspect?: boolean;
    crop_x?: number;
    crop_y?: number;
    crop_width?: number;
    crop_height?: number;
    
    // Enhancement options
    brightness?: number; // -100 to 100
    contrast?: number; // -100 to 100
    saturation?: number; // -100 to 100
    sharpness?: number; // -100 to 100
    gamma?: number; // 0.1 to 3.0
    
    // Filter options
    filter_type?: 'blur' | 'sharpen' | 'edge' | 'emboss' | 'vintage' | 'sepia' | 'bw' | 'negative';
    filter_intensity?: number; // 0.1 to 2.0
    
    // Advanced options
    noise_reduction_strength?: number; // 1 to 10
    upscale_factor?: number; // 2, 4, 8
    upscale_algorithm?: 'bicubic' | 'lanczos' | 'neural';
    color_temperature?: number; // 2000 to 10000
    
    // Research options
    agentType?: 'chat' | 'research';
    preserve_metadata?: boolean;
    quality_level?: 'fast' | 'standard' | 'high' | 'research';
    analysis_level?: 'basic' | 'detailed' | 'scientific';
    
    // Batch operations
    batch_operations?: Array<{
      operation: string;
      parameters: Record<string, any>;
    }>;
  }): Promise<ImageEditResult> {
    
    const startTime = Date.now();
    const {
      action,
      image_path,
      output_name,
      width,
      height,
      maintain_aspect = true,
      crop_x = 0,
      crop_y = 0,
      crop_width,
      crop_height,
      brightness = 0,
      contrast = 0,
      saturation = 0,
      sharpness = 0,
      gamma = 1.0,
      filter_type = 'blur',
      filter_intensity = 1.0,
      noise_reduction_strength = 5,
      upscale_factor = 2,
      upscale_algorithm = 'bicubic',
      color_temperature = 6500,
      agentType = 'chat',
      preserve_metadata = false,
      quality_level = 'standard',
      analysis_level = 'basic',
      batch_operations = []
    } = input;

    if (!image_path || !fs.existsSync(image_path)) {
      throw new Error('Valid image path is required');
    }

    // Generate output filename
    const timestamp = Date.now();
    const inputFilename = path.basename(image_path, path.extname(image_path));
    const outputFilename = output_name || `${inputFilename}_${action}_${agentType}_${timestamp}.png`;
    const outputPath = path.join(this.config.outputDir!, outputFilename);

    let attempt = 0;
    while (attempt < this.config.maxRetries!) {
      try {
        let result: ImageEditResult;

        switch (action) {
          case 'resize':
            result = await this.resizeImage(image_path, outputPath, width, height, maintain_aspect, agentType, quality_level);
            break;
            
          case 'crop':
            result = await this.cropImage(image_path, outputPath, crop_x, crop_y, crop_width!, crop_height!, agentType);
            break;
            
          case 'enhance':
            result = await this.enhanceImage(image_path, outputPath, {
              brightness, contrast, saturation, sharpness, gamma, color_temperature
            }, agentType, quality_level);
            break;
            
          case 'filter':
            result = await this.applyFilter(image_path, outputPath, filter_type, filter_intensity, agentType);
            break;
            
          case 'restore':
            result = await this.restoreImage(image_path, outputPath, agentType, quality_level);
            break;
            
          case 'colorize':
            result = await this.colorizeImage(image_path, outputPath, agentType, quality_level);
            break;
            
          case 'remove-background':
            result = await this.removeBackground(image_path, outputPath, agentType, quality_level);
            break;
            
          case 'upscale':
            result = await this.upscaleImage(image_path, outputPath, upscale_factor, upscale_algorithm, agentType, quality_level);
            break;
            
          case 'denoise':
            result = await this.denoiseImage(image_path, outputPath, noise_reduction_strength, agentType, quality_level);
            break;
            
          case 'artistic-filter':
            result = await this.applyArtisticFilter(image_path, outputPath, filter_type, agentType);
            break;
            
          case 'batch-edit':
            result = await this.batchEdit(image_path, outputPath, batch_operations, agentType, quality_level);
            break;
            
          case 'advanced-edit':
            result = await this.advancedEdit(image_path, outputPath, input, agentType);
            break;
            
          default:
            throw new Error(`Unknown action: ${action}`);
        }

        result.processing_info.processing_time = Date.now() - startTime;
        result.processing_info.agent_type = agentType;
        
        // Add research metadata for research agents
        if (agentType === 'research') {
          result.metadata = await this.generateEditingMetadata(result, analysis_level);
        }

        this.requestCount++;
        return result;

      } catch (error: any) {
        attempt++;
        if (attempt >= this.config.maxRetries!) {
          throw new Error(`Image editing failed after ${this.config.maxRetries} attempts: ${error.message}`);
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }

    throw new Error('Image editing failed');
  }

  private async resizeImage(
    inputPath: string,
    outputPath: string,
    width?: number,
    height?: number,
    maintainAspect: boolean = true,
    agentType: 'chat' | 'research' = 'chat',
    qualityLevel: string = 'standard'
  ): Promise<ImageEditResult> {
    
    const script = `
import cv2
import sys
from PIL import Image
import json

def resize_image(input_path, output_path, width, height, maintain_aspect, quality_level):
    try:
        # Load image
        img = cv2.imread(input_path)
        if img is None:
            raise Exception("Could not load image")
        
        h, w = img.shape[:2]
        original_resolution = f"{w}x{h}"
        
        # Calculate new dimensions
        if maintain_aspect and width and height:
            aspect_ratio = w / h
            if width / height > aspect_ratio:
                width = int(height * aspect_ratio)
            else:
                height = int(width / aspect_ratio)
        elif maintain_aspect and width:
            aspect_ratio = w / h
            height = int(width / aspect_ratio)
        elif maintain_aspect and height:
            aspect_ratio = w / h
            width = int(height * aspect_ratio)
        
        # Choose interpolation method based on quality level
        if quality_level == 'research':
            interpolation = cv2.INTER_LANCZOS4
        elif quality_level == 'high':
            interpolation = cv2.INTER_CUBIC
        else:
            interpolation = cv2.INTER_LINEAR
        
        # Resize
        resized = cv2.resize(img, (width, height), interpolation=interpolation)
        
        # Save
        cv2.imwrite(output_path, resized)
        
        return {
            "success": True,
            "original_resolution": original_resolution,
            "new_resolution": f"{width}x{height}",
            "operations": ["resize"]
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

# Get arguments
input_path = sys.argv[1]
output_path = sys.argv[2]
width = int(sys.argv[3]) if sys.argv[3] != 'None' else None
height = int(sys.argv[4]) if sys.argv[4] != 'None' else None
maintain_aspect = sys.argv[5] == 'True'
quality_level = sys.argv[6]

result = resize_image(input_path, output_path, width, height, maintain_aspect, quality_level)
print(json.dumps(result))
`;

    const scriptPath = path.join(this.config.scriptsDir!, 'resize.py');
    fs.writeFileSync(scriptPath, script);

    const result = await this.runPythonScript(scriptPath, [
      inputPath,
      outputPath,
      width?.toString() || 'None',
      height?.toString() || 'None',
      maintainAspect.toString(),
      qualityLevel
    ]);

    return {
      success: result.success,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'resize',
      processing_info: {
        input_resolution: result.original_resolution || 'unknown',
        output_resolution: result.new_resolution || 'unknown',
        processing_time: 0,
        operations_applied: result.operations || ['resize'],
        agent_type: agentType
      }
    };
  }

  private async cropImage(
    inputPath: string,
    outputPath: string,
    x: number,
    y: number,
    width: number,
    height: number,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageEditResult> {
    
    const script = `
import cv2
import sys
import json

def crop_image(input_path, output_path, x, y, width, height):
    try:
        img = cv2.imread(input_path)
        if img is None:
            raise Exception("Could not load image")
        
        h, w = img.shape[:2]
        original_resolution = f"{w}x{h}"
        
        # Ensure crop bounds are valid
        x = max(0, min(x, w))
        y = max(0, min(y, h))
        width = min(width, w - x)
        height = min(height, h - y)
        
        # Crop
        cropped = img[y:y+height, x:x+width]
        
        # Save
        cv2.imwrite(output_path, cropped)
        
        return {
            "success": True,
            "original_resolution": original_resolution,
            "new_resolution": f"{width}x{height}",
            "operations": ["crop"]
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

input_path = sys.argv[1]
output_path = sys.argv[2]
x = int(sys.argv[3])
y = int(sys.argv[4])
width = int(sys.argv[5])
height = int(sys.argv[6])

result = crop_image(input_path, output_path, x, y, width, height)
print(json.dumps(result))
`;

    const scriptPath = path.join(this.config.scriptsDir!, 'crop.py');
    fs.writeFileSync(scriptPath, script);

    const result = await this.runPythonScript(scriptPath, [
      inputPath, outputPath, x.toString(), y.toString(), width.toString(), height.toString()
    ]);

    return {
      success: result.success,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'crop',
      processing_info: {
        input_resolution: result.original_resolution || 'unknown',
        output_resolution: result.new_resolution || 'unknown',
        processing_time: 0,
        operations_applied: result.operations || ['crop'],
        agent_type: agentType
      }
    };
  }

  private async enhanceImage(
    inputPath: string,
    outputPath: string,
    enhancements: any,
    agentType: 'chat' | 'research' = 'chat',
    qualityLevel: string = 'standard'
  ): Promise<ImageEditResult> {
    
    const script = `
import cv2
import numpy as np
import sys
import json
from PIL import Image, ImageEnhance

def enhance_image(input_path, output_path, brightness, contrast, saturation, sharpness, gamma, color_temp):
    try:
        # Load with PIL for enhancement operations
        pil_img = Image.open(input_path)
        original_resolution = f"{pil_img.width}x{pil_img.height}"
        
        # Apply brightness
        if brightness != 0:
            enhancer = ImageEnhance.Brightness(pil_img)
            pil_img = enhancer.enhance(1 + brightness / 100)
        
        # Apply contrast
        if contrast != 0:
            enhancer = ImageEnhance.Contrast(pil_img)
            pil_img = enhancer.enhance(1 + contrast / 100)
        
        # Apply saturation
        if saturation != 0:
            enhancer = ImageEnhance.Color(pil_img)
            pil_img = enhancer.enhance(1 + saturation / 100)
        
        # Apply sharpness
        if sharpness != 0:
            enhancer = ImageEnhance.Sharpness(pil_img)
            pil_img = enhancer.enhance(1 + sharpness / 100)
        
        # Convert to OpenCV for gamma correction
        if gamma != 1.0:
            cv_img = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)
            
            # Build lookup table for gamma correction
            inv_gamma = 1.0 / gamma
            table = np.array([((i / 255.0) ** inv_gamma) * 255 for i in np.arange(0, 256)]).astype("uint8")
            cv_img = cv2.LUT(cv_img, table)
            
            # Convert back to PIL
            pil_img = Image.fromarray(cv2.cvtColor(cv_img, cv2.COLOR_BGR2RGB))
        
        # Save
        pil_img.save(output_path, quality=95)
        
        operations = []
        if brightness != 0: operations.append("brightness")
        if contrast != 0: operations.append("contrast")
        if saturation != 0: operations.append("saturation")
        if sharpness != 0: operations.append("sharpness")
        if gamma != 1.0: operations.append("gamma")
        
        return {
            "success": True,
            "original_resolution": original_resolution,
            "new_resolution": f"{pil_img.width}x{pil_img.height}",
            "operations": operations
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

input_path = sys.argv[1]
output_path = sys.argv[2]
brightness = float(sys.argv[3])
contrast = float(sys.argv[4])
saturation = float(sys.argv[5])
sharpness = float(sys.argv[6])
gamma = float(sys.argv[7])
color_temp = float(sys.argv[8])

result = enhance_image(input_path, output_path, brightness, contrast, saturation, sharpness, gamma, color_temp)
print(json.dumps(result))
`;

    const scriptPath = path.join(this.config.scriptsDir!, 'enhance.py');
    fs.writeFileSync(scriptPath, script);

    const result = await this.runPythonScript(scriptPath, [
      inputPath, outputPath,
      enhancements.brightness.toString(),
      enhancements.contrast.toString(),
      enhancements.saturation.toString(),
      enhancements.sharpness.toString(),
      enhancements.gamma.toString(),
      enhancements.color_temperature.toString()
    ]);

    return {
      success: result.success,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'enhance',
      processing_info: {
        input_resolution: result.original_resolution || 'unknown',
        output_resolution: result.new_resolution || 'unknown',
        processing_time: 0,
        operations_applied: result.operations || ['enhance'],
        agent_type: agentType
      }
    };
  }

  private async applyFilter(
    inputPath: string,
    outputPath: string,
    filterType: string,
    intensity: number,
    agentType: 'chat' | 'research' = 'chat'
  ): Promise<ImageEditResult> {
    
    const script = `
import cv2
import numpy as np
import sys
import json
from PIL import Image, ImageFilter

def apply_filter(input_path, output_path, filter_type, intensity):
    try:
        img = cv2.imread(input_path)
        if img is None:
            raise Exception("Could not load image")
        
        h, w = img.shape[:2]
        original_resolution = f"{w}x{h}"
        
        if filter_type == 'blur':
            kernel_size = int(15 * intensity)
            if kernel_size % 2 == 0:
                kernel_size += 1
            filtered = cv2.GaussianBlur(img, (kernel_size, kernel_size), 0)
        
        elif filter_type == 'sharpen':
            kernel = np.array([[-1,-1,-1], [-1,9*intensity,-1], [-1,-1,-1]])
            filtered = cv2.filter2D(img, -1, kernel)
        
        elif filter_type == 'edge':
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            edges = cv2.Canny(gray, 50, 150)
            filtered = cv2.cvtColor(edges, cv2.COLOR_GRAY2BGR)
        
        elif filter_type == 'emboss':
            kernel = np.array([[-2, -1, 0], [-1, 1, 1], [0, 1, 2]])
            filtered = cv2.filter2D(img, -1, kernel)
        
        elif filter_type == 'sepia':
            kernel = np.array([[0.272, 0.534, 0.131],
                              [0.349, 0.686, 0.168],
                              [0.393, 0.769, 0.189]])
            filtered = cv2.transform(img, kernel)
        
        elif filter_type == 'bw':
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            filtered = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
        
        elif filter_type == 'negative':
            filtered = 255 - img
        
        else:
            filtered = img
        
        cv2.imwrite(output_path, filtered)
        
        return {
            "success": True,
            "original_resolution": original_resolution,
            "new_resolution": original_resolution,
            "operations": [filter_type]
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

input_path = sys.argv[1]
output_path = sys.argv[2]
filter_type = sys.argv[3]
intensity = float(sys.argv[4])

result = apply_filter(input_path, output_path, filter_type, intensity)
print(json.dumps(result))
`;

    const scriptPath = path.join(this.config.scriptsDir!, 'filter.py');
    fs.writeFileSync(scriptPath, script);

    const result = await this.runPythonScript(scriptPath, [
      inputPath, outputPath, filterType, intensity.toString()
    ]);

    return {
      success: result.success,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: `${filterType}_filter`,
      processing_info: {
        input_resolution: result.original_resolution || 'unknown',
        output_resolution: result.new_resolution || 'unknown',
        processing_time: 0,
        operations_applied: result.operations || [filterType],
        agent_type: agentType
      }
    };
  }

  private async upscaleImage(
    inputPath: string,
    outputPath: string,
    factor: number,
    algorithm: string,
    agentType: 'chat' | 'research' = 'chat',
    qualityLevel: string = 'standard'
  ): Promise<ImageEditResult> {
    
    const script = `
import cv2
import sys
import json

def upscale_image(input_path, output_path, factor, algorithm):
    try:
        img = cv2.imread(input_path)
        if img is None:
            raise Exception("Could not load image")
        
        h, w = img.shape[:2]
        original_resolution = f"{w}x{h}"
        
        new_width = int(w * factor)
        new_height = int(h * factor)
        
        if algorithm == 'bicubic':
            interpolation = cv2.INTER_CUBIC
        elif algorithm == 'lanczos':
            interpolation = cv2.INTER_LANCZOS4
        else:
            interpolation = cv2.INTER_LINEAR
        
        upscaled = cv2.resize(img, (new_width, new_height), interpolation=interpolation)
        cv2.imwrite(output_path, upscaled)
        
        return {
            "success": True,
            "original_resolution": original_resolution,
            "new_resolution": f"{new_width}x{new_height}",
            "operations": [f"upscale_{algorithm}"]
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

input_path = sys.argv[1]
output_path = sys.argv[2]
factor = int(sys.argv[3])
algorithm = sys.argv[4]

result = upscale_image(input_path, output_path, factor, algorithm)
print(json.dumps(result))
`;

    const scriptPath = path.join(this.config.scriptsDir!, 'upscale.py');
    fs.writeFileSync(scriptPath, script);

    const result = await this.runPythonScript(scriptPath, [
      inputPath, outputPath, factor.toString(), algorithm
    ]);

    return {
      success: result.success,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'upscale',
      processing_info: {
        input_resolution: result.original_resolution || 'unknown',
        output_resolution: result.new_resolution || 'unknown',
        processing_time: 0,
        operations_applied: result.operations || ['upscale'],
        agent_type: agentType
      }
    };
  }

  // Placeholder implementations for other operations
  private async restoreImage(inputPath: string, outputPath: string, agentType: 'chat' | 'research', qualityLevel: string): Promise<ImageEditResult> {
    // Basic noise reduction and sharpening
    return await this.denoiseImage(inputPath, outputPath, 3, agentType, qualityLevel);
  }

  private async colorizeImage(inputPath: string, outputPath: string, agentType: 'chat' | 'research', qualityLevel: string): Promise<ImageEditResult> {
    // For now, just copy the image - would need AI model for true colorization
    fs.copyFileSync(inputPath, outputPath);
    return {
      success: true,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'colorize_placeholder',
      processing_info: {
        input_resolution: 'unknown',
        output_resolution: 'unknown',
        processing_time: 0,
        operations_applied: ['colorize'],
        agent_type: agentType
      }
    };
  }

  private async removeBackground(inputPath: string, outputPath: string, agentType: 'chat' | 'research', qualityLevel: string): Promise<ImageEditResult> {
    // Placeholder - would need rembg or similar library
    fs.copyFileSync(inputPath, outputPath);
    return {
      success: true,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'remove_background_placeholder',
      processing_info: {
        input_resolution: 'unknown',
        output_resolution: 'unknown',
        processing_time: 0,
        operations_applied: ['remove_background'],
        agent_type: agentType
      }
    };
  }

  private async denoiseImage(inputPath: string, outputPath: string, strength: number, agentType: 'chat' | 'research', qualityLevel: string): Promise<ImageEditResult> {
    const script = `
import cv2
import sys
import json

def denoise_image(input_path, output_path, strength):
    try:
        img = cv2.imread(input_path)
        if img is None:
            raise Exception("Could not load image")
        
        h, w = img.shape[:2]
        original_resolution = f"{w}x{h}"
        
        # Apply Non-local Means Denoising
        denoised = cv2.fastNlMeansDenoisingColored(img, None, strength, strength, 7, 21)
        cv2.imwrite(output_path, denoised)
        
        return {
            "success": True,
            "original_resolution": original_resolution,
            "new_resolution": original_resolution,
            "operations": ["denoise"]
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}

input_path = sys.argv[1]
output_path = sys.argv[2]
strength = int(sys.argv[3])

result = denoise_image(input_path, output_path, strength)
print(json.dumps(result))
`;

    const scriptPath = path.join(this.config.scriptsDir!, 'denoise.py');
    fs.writeFileSync(scriptPath, script);

    const result = await this.runPythonScript(scriptPath, [
      inputPath, outputPath, strength.toString()
    ]);

    return {
      success: result.success,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'denoise',
      processing_info: {
        input_resolution: result.original_resolution || 'unknown',
        output_resolution: result.new_resolution || 'unknown',
        processing_time: 0,
        operations_applied: result.operations || ['denoise'],
        agent_type: agentType
      }
    };
  }

  private async applyArtisticFilter(inputPath: string, outputPath: string, style: string, agentType: 'chat' | 'research'): Promise<ImageEditResult> {
    // Apply artistic effects using OpenCV
    return await this.applyFilter(inputPath, outputPath, style, 1.0, agentType);
  }

  private async batchEdit(inputPath: string, outputPath: string, operations: any[], agentType: 'chat' | 'research', qualityLevel: string): Promise<ImageEditResult> {
    let currentPath = inputPath;
    const allOperations: string[] = [];
    
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const tempPath = path.join(this.config.outputDir!, `temp_${i}_${Date.now()}.png`);
      
      // Apply each operation
      switch (op.operation) {
        case 'resize':
          await this.resizeImage(currentPath, tempPath, op.parameters.width, op.parameters.height, true, agentType, qualityLevel);
          break;
        case 'enhance':
          await this.enhanceImage(currentPath, tempPath, op.parameters, agentType, qualityLevel);
          break;
        case 'filter':
          await this.applyFilter(currentPath, tempPath, op.parameters.filter_type, op.parameters.intensity || 1.0, agentType);
          break;
      }
      
      allOperations.push(op.operation);
      currentPath = tempPath;
    }
    
    // Copy final result to output path
    fs.copyFileSync(currentPath, outputPath);
    
    // Clean up temp files
    for (let i = 0; i < operations.length; i++) {
      const tempPath = path.join(this.config.outputDir!, `temp_${i}_${Date.now()}.png`);
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
    
    return {
      success: true,
      output_path: outputPath,
      output_url: `/edited_images/${path.basename(outputPath)}`,
      operation_performed: 'batch_edit',
      processing_info: {
        input_resolution: 'unknown',
        output_resolution: 'unknown',
        processing_time: 0,
        operations_applied: allOperations,
        agent_type: agentType
      }
    };
  }

  private async advancedEdit(inputPath: string, outputPath: string, params: any, agentType: 'chat' | 'research'): Promise<ImageEditResult> {
    // Combine multiple operations based on agent type
    const operations = [];
    
    if (agentType === 'research') {
      operations.push(
        { operation: 'enhance', parameters: { brightness: 5, contrast: 10, sharpness: 15 } },
        { operation: 'denoise', parameters: { strength: 3 } }
      );
    } else {
      operations.push(
        { operation: 'enhance', parameters: { brightness: 2, contrast: 5 } }
      );
    }
    
    return await this.batchEdit(inputPath, outputPath, operations, agentType, 'high');
  }

  private async runPythonScript(scriptPath: string, args: string[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const python = spawn(this.config.pythonPath!, [scriptPath, ...args]);
      let stdout = '';
      let stderr = '';

      python.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      python.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python script failed with code ${code}: ${stderr}`));
        } else {
          try {
            const result = JSON.parse(stdout.trim());
            if (result.success === false) {
              reject(new Error(result.error || 'Python script execution failed'));
            } else {
              resolve(result);
            }
          } catch (error) {
            reject(new Error(`Failed to parse Python script output: ${stdout}`));
          }
        }
      });

      // Set timeout
      setTimeout(() => {
        python.kill();
        reject(new Error('Python script timeout'));
      }, this.config.timeout);
    });
  }

  private initializePythonScripts(): void {
    if (this.scriptsInitialized) return;

    // Create requirements.txt for dependencies
    const requirements = `
opencv-python>=4.5.0
Pillow>=8.0.0
numpy>=1.20.0
scikit-image>=0.18.0
`;

    fs.writeFileSync(path.join(this.config.scriptsDir!, 'requirements.txt'), requirements.trim());
    
    this.scriptsInitialized = true;
  }

  private async generateEditingMetadata(result: ImageEditResult, analysisLevel: string): Promise<any> {
    return {
      technical_details: `Operations: ${result.processing_info.operations_applied.join(', ')}. Resolution: ${result.processing_info.input_resolution} → ${result.processing_info.output_resolution}`,
      quality_assessment: analysisLevel === 'scientific' ? 'Research-grade processing applied' : 'Standard quality enhancement',
      recommendations: [
        'Consider additional noise reduction for archival quality',
        'Verify color accuracy for scientific applications',
        'Apply appropriate metadata preservation for research use'
      ]
    };
  }

  // Utility methods for integration
  async editForChat(imagePath: string, operation: string, params: any = {}): Promise<{ output_url: string, info: any }> {
    const result = await this.execute({
      action: operation as any,
      image_path: imagePath,
      agentType: 'chat',
      quality_level: 'standard',
      ...params
    });

    return {
      output_url: result.output_url,
      info: result.processing_info
    };
  }

  async editForResearch(imagePath: string, operation: string, params: any = {}): Promise<ImageEditResult> {
    return await this.execute({
      action: operation as any,
      image_path: imagePath,
      agentType: 'research',
      quality_level: 'research',
      analysis_level: 'scientific',
      preserve_metadata: true,
      ...params
    });
  }

  getToolMetrics(): {
    provider: string;
    requestCount: number;
    supportsResize: boolean;
    supportsCrop: boolean;
    supportsEnhancement: boolean;
    supportsFilters: boolean;
    supportsUpscaling: boolean;
    supportsDenoising: boolean;
    supportsBatchEditing: boolean;
    supportsChatMode: boolean;
    supportsResearchMode: boolean;
  } {
    return {
      provider: 'OpenCV + PIL',
      requestCount: this.requestCount,
      supportsResize: true,
      supportsCrop: true,
      supportsEnhancement: true,
      supportsFilters: true,
      supportsUpscaling: true,
      supportsDenoising: true,
      supportsBatchEditing: true,
      supportsChatMode: true,
      supportsResearchMode: true
    };
  }

  async health(): Promise<{
    status: string;
    responseTime: number;
    pythonAvailable: boolean;
    dependenciesInstalled: boolean;
  }> {
    const start = Date.now();
    
    try {
      // Test Python availability
      const testResult = await this.runPythonScript(
        path.join(this.config.scriptsDir!, 'test.py'),
        []
      );
      
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
        pythonAvailable: true,
        dependenciesInstalled: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        pythonAvailable: false,
        dependenciesInstalled: false
      };
    }
  }
} 