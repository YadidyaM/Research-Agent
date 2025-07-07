import { Tool } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
const pdfParse = require('pdf-parse');

interface PDFContent {
  text: string;
  title?: string;
  author?: string;
  creator?: string;
  producer?: string;
  creationDate?: Date;
  modificationDate?: Date;
  pages: number;
  metadata: {
    [key: string]: any;
  };
  extractedAt: Date;
  source: string;
  success: boolean;
  error?: string;
}

interface PDFParserConfig {
  maxFileSize?: number; // in bytes, default 50MB
  timeout?: number; // in milliseconds, default 30 seconds
  tempDir?: string; // temporary directory for downloads
  enableOCR?: boolean; // future feature for scanned PDFs
  tavilyApiKey?: string; // for TAVILY integration
}

export class PDFParserTool implements Tool {
  name = 'pdf_parser';
  description = 'Extract text content from PDF files (local or remote URLs) with TAVILY integration';
  
  private config: PDFParserConfig;
  private tavilyClient: any;
  private tempDir: string;

  constructor(config: PDFParserConfig = {}) {
    this.config = {
      maxFileSize: config.maxFileSize || 50 * 1024 * 1024, // 50MB default
      timeout: config.timeout || 30000, // 30 seconds default
      tempDir: config.tempDir || path.join(process.cwd(), 'temp'),
      enableOCR: config.enableOCR || false,
      tavilyApiKey: config.tavilyApiKey,
    };

    this.tempDir = this.config.tempDir!;
    this.ensureTempDirectory();

    // Initialize TAVILY client if API key is provided
    if (this.config.tavilyApiKey) {
      try {
        const { TavilySearchAPIClient } = require('@tavily/core');
        this.tavilyClient = new TavilySearchAPIClient({ apiKey: this.config.tavilyApiKey });
      } catch (error) {
        console.warn('TAVILY client initialization failed:', error);
      }
    }
  }

  async execute(input: {
    source: string; // URL or file path
    extractMetadata?: boolean;
    useOCR?: boolean;
    useTavilyExtract?: boolean; // Use TAVILY's extract API for PDFs
    maxPages?: number; // Limit pages to process
    pageRange?: { start: number; end: number }; // Specific page range
  }): Promise<PDFContent> {
    const {
      source,
      extractMetadata = true,
      useOCR = false,
      useTavilyExtract = true,
      maxPages,
      pageRange,
    } = input;

    try {
      // Validate source
      if (!source || typeof source !== 'string') {
        throw new Error('Invalid source provided');
      }

      // Check if source is URL or file path
      const isUrl = this.isValidUrl(source);
      
      if (isUrl) {
        // Try TAVILY extract first if available
        if (useTavilyExtract && this.tavilyClient) {
          try {
            const tavilyResult = await this.extractWithTavily(source);
            if (tavilyResult.success) {
              return tavilyResult;
            }
          } catch (error) {
            console.warn('TAVILY extraction failed, falling back to direct parsing:', error);
          }
        }

        // Download PDF and parse
        return await this.parseRemotePDF(source, {
          extractMetadata,
          useOCR,
          maxPages,
          pageRange,
        });
      } else {
        // Parse local file
        return await this.parseLocalPDF(source, {
          extractMetadata,
          useOCR,
          maxPages,
          pageRange,
        });
      }
    } catch (error) {
      console.error('PDF parsing error:', error);
      return this.createErrorResult(source, error);
    }
  }

  private async extractWithTavily(url: string): Promise<PDFContent> {
    if (!this.tavilyClient) {
      throw new Error('TAVILY client not initialized');
    }

    try {
      const response = await this.tavilyClient.extract(url);
      
      return {
        text: response.raw_content || response.content || '',
        title: response.title || 'PDF Document',
        pages: 1, // TAVILY doesn't provide page count
        metadata: {
          extractedWith: 'TAVILY',
          url: url,
          ...response.metadata,
        },
        extractedAt: new Date(),
        source: url,
        success: true,
      };
    } catch (error) {
      throw new Error(`TAVILY extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async parseRemotePDF(url: string, options: {
    extractMetadata: boolean;
    useOCR: boolean;
    maxPages?: number;
    pageRange?: { start: number; end: number };
  }): Promise<PDFContent> {
    // Download PDF to temporary file
    const tempFilePath = await this.downloadPDF(url);
    
    try {
      const result = await this.parseLocalPDF(tempFilePath, options);
      result.source = url; // Update source to original URL
      return result;
    } finally {
      // Clean up temporary file
      this.cleanupTempFile(tempFilePath);
    }
  }

  private async parseLocalPDF(filePath: string, options: {
    extractMetadata: boolean;
    useOCR: boolean;
    maxPages?: number;
    pageRange?: { start: number; end: number };
  }): Promise<PDFContent> {
    try {
      // Check file exists and size
      const stats = fs.statSync(filePath);
      if (stats.size > this.config.maxFileSize!) {
        throw new Error(`PDF file too large: ${stats.size} bytes (max: ${this.config.maxFileSize} bytes)`);
      }

      // Read PDF buffer
      const pdfBuffer = fs.readFileSync(filePath);
      
      // Configure parsing options
      const parseOptions: any = {
        max: options.maxPages || 0, // 0 means no limit
      };

      // Parse PDF
      const data = await pdfParse(pdfBuffer, parseOptions);
      
      // Extract text based on page range if specified
      let extractedText = data.text;
      if (options.pageRange) {
        extractedText = this.extractPageRange(data.text, options.pageRange, data.numpages);
      }

      // Clean and format text
      const cleanedText = this.cleanExtractedText(extractedText);

      const result: PDFContent = {
        text: cleanedText,
        pages: data.numpages,
        extractedAt: new Date(),
        source: filePath,
        success: true,
        metadata: {
          fileSize: stats.size,
          extractionMethod: 'pdf-parse',
        },
      };

      // Extract metadata if requested
      if (options.extractMetadata && data.info) {
        result.title = data.info.Title || undefined;
        result.author = data.info.Author || undefined;
        result.creator = data.info.Creator || undefined;
        result.producer = data.info.Producer || undefined;
        result.creationDate = data.info.CreationDate ? new Date(data.info.CreationDate) : undefined;
        result.modificationDate = data.info.ModDate ? new Date(data.info.ModDate) : undefined;
        
        result.metadata = {
          ...result.metadata,
          ...data.info,
        };
      }

      return result;
    } catch (error) {
      throw new Error(`PDF parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async downloadPDF(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const protocol = parsedUrl.protocol === 'https:' ? https : http;
      
      // Generate temporary file path
      const tempFileName = `pdf_${Date.now()}_${Math.random().toString(36).substring(7)}.pdf`;
      const tempFilePath = path.join(this.tempDir, tempFileName);
      
      const file = fs.createWriteStream(tempFilePath);
      let downloadedBytes = 0;
      
      const request = protocol.get(url, {
        timeout: this.config.timeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      }, (response) => {
        // Check response status
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
          return;
        }

        // Check content type
        const contentType = response.headers['content-type'];
        if (contentType && !contentType.includes('application/pdf')) {
          console.warn(`Unexpected content type: ${contentType}, continuing anyway`);
        }

        // Check content length
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (contentLength > this.config.maxFileSize!) {
          reject(new Error(`PDF too large: ${contentLength} bytes`));
          return;
        }

        response.pipe(file);

        response.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          if (downloadedBytes > this.config.maxFileSize!) {
            request.destroy();
            reject(new Error(`PDF too large: ${downloadedBytes} bytes`));
            return;
          }
        });

        response.on('end', () => {
          file.end();
          resolve(tempFilePath);
        });

        response.on('error', (error) => {
          file.destroy();
          reject(error);
        });
      });

      request.on('error', (error) => {
        file.destroy();
        reject(error);
      });

      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  private cleanExtractedText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove page numbers and headers/footers (basic patterns)
      .replace(/^Page \d+.*$/gm, '')
      .replace(/^\d+\s*$/gm, '')
      // Remove common PDF artifacts
      .replace(/\f/g, '\n') // Form feed to newline
      .replace(/\r\n/g, '\n') // Normalize line endings
      .replace(/\r/g, '\n')
      // Remove excessive newlines
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  private extractPageRange(text: string, pageRange: { start: number; end: number }, totalPages: number): string {
    // This is a simplified approach - actual page extraction would require more sophisticated parsing
    const lines = text.split('\n');
    const linesPerPage = Math.floor(lines.length / totalPages);
    
    const startLine = Math.max(0, (pageRange.start - 1) * linesPerPage);
    const endLine = Math.min(lines.length, pageRange.end * linesPerPage);
    
    return lines.slice(startLine, endLine).join('\n');
  }

  private isValidUrl(source: string): boolean {
    try {
      const url = new URL(source);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  private cleanupTempFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.warn(`Failed to cleanup temp file ${filePath}:`, error);
    }
  }

  private createErrorResult(source: string, error: any): PDFContent {
    return {
      text: '',
      pages: 0,
      metadata: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      extractedAt: new Date(),
      source,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }

  // Utility methods for batch processing
  async parseMultiplePDFs(sources: string[], options: {
    extractMetadata?: boolean;
    useOCR?: boolean;
    useTavilyExtract?: boolean;
    maxConcurrency?: number;
  } = {}): Promise<PDFContent[]> {
    const {
      extractMetadata = true,
      useOCR = false,
      useTavilyExtract = true,
      maxConcurrency = 3,
    } = options;

    const results: PDFContent[] = [];
    
    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < sources.length; i += maxConcurrency) {
      const batch = sources.slice(i, i + maxConcurrency);
      
      const batchPromises = batch.map(source => 
        this.execute({
          source,
          extractMetadata,
          useOCR,
          useTavilyExtract,
        })
      );

      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push(this.createErrorResult(batch[index], result.reason));
        }
      });
    }

    return results;
  }

  async extractKeyInformation(pdfContent: PDFContent, query?: string): Promise<{
    summary: string;
    keyPoints: string[];
    relevantSections: string[];
    metadata: any;
  }> {
    // This would typically use an LLM service, but for now we'll do basic extraction
    const text = pdfContent.text;
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    
    // Extract potential headings (lines that are shorter and might be titles)
    const headings = lines.filter(line => 
      line.length < 100 && 
      line.length > 5 && 
      !line.includes('.') &&
      line.trim() === line.trim().toUpperCase()
    );

    // Extract sentences that might be key points
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyPoints = sentences
      .filter(sentence => 
        sentence.includes('important') || 
        sentence.includes('key') || 
        sentence.includes('significant') ||
        sentence.includes('conclusion') ||
        sentence.includes('result')
      )
      .slice(0, 10);

    return {
      summary: text.substring(0, 500) + (text.length > 500 ? '...' : ''),
      keyPoints: keyPoints.length > 0 ? keyPoints : sentences.slice(0, 5),
      relevantSections: headings.slice(0, 10),
      metadata: {
        totalSentences: sentences.length,
        totalHeadings: headings.length,
        wordCount: text.split(/\s+/).length,
        ...pdfContent.metadata,
      },
    };
  }

  // Health check method
  async health(): Promise<boolean> {
    try {
      // Test with a simple text buffer
      const testBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n');
      await pdfParse(testBuffer);
      return true;
    } catch (error) {
      console.error('PDF parser health check failed:', error);
      return false;
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    try {
      const files = fs.readdirSync(this.tempDir);
      for (const file of files) {
        if (file.startsWith('pdf_')) {
          const filePath = path.join(this.tempDir, file);
          const stats = fs.statSync(filePath);
          
          // Remove files older than 1 hour
          if (Date.now() - stats.mtime.getTime() > 3600000) {
            fs.unlinkSync(filePath);
          }
        }
      }
    } catch (error) {
      console.warn('PDF cleanup failed:', error);
    }
  }
} 