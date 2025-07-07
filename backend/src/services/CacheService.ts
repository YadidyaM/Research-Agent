import { ICacheService } from '../interfaces/services/ICacheService';
import { MultiLevelCache, MultiLevelCacheConfig } from './cache/MultiLevelCache';
import { ConfigurationManager } from '../config/ConfigurationManager';

export class CacheService {
  private static instance: CacheService;
  private cache: MultiLevelCache;
  private configManager: ConfigurationManager;

  private constructor() {
    this.configManager = ConfigurationManager.getInstance();
    this.cache = this.initializeCache();
    
    // Watch for configuration changes
    this.configManager.watch('cache', (cacheConfig) => {
      this.reinitializeCache(cacheConfig);
    });
  }

  static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  private initializeCache(): MultiLevelCache {
    const cacheConfig = this.configManager.getCacheConfig();
    
    if (!cacheConfig.enabled) {
      // Return a no-op cache if disabled
      console.log('Cache is disabled');
    }

    const config: MultiLevelCacheConfig = {
      memory: {
        maxSize: cacheConfig.memory.maxSize,
        maxMemoryMB: cacheConfig.memory.maxMemoryMB
      },
      redis: cacheConfig.redis.enabled ? {
        enabled: true,
        host: cacheConfig.redis.host,
        port: cacheConfig.redis.port,
        password: cacheConfig.redis.password,
        database: cacheConfig.redis.database,
        keyPrefix: cacheConfig.redis.keyPrefix,
        maxRetries: cacheConfig.redis.maxRetries,
        retryDelayOnFailover: cacheConfig.redis.retryDelayOnFailover,
        connectTimeout: cacheConfig.redis.connectTimeout,
        lazyConnect: cacheConfig.redis.lazyConnect
      } : { enabled: false },
      writeThrough: cacheConfig.writeThrough,
      readPreference: cacheConfig.readPreference,
      syncStrategy: cacheConfig.syncStrategy
    };

    return new MultiLevelCache(config);
  }

  private reinitializeCache(newConfig: any): void {
    console.log('Reinitializing cache with new configuration');
    
    try {
      // Cleanup existing cache
      this.cache.cleanup?.();
      
      // Create new cache
      this.cache = this.initializeCache();
      
      console.log('Cache successfully reinitialized');
    } catch (error) {
      console.error('Failed to reinitialize cache:', error);
    }
  }

  getCache(): ICacheService {
    return this.cache;
  }

  // Convenience methods that delegate to the cache
  async get<T>(key: string, options?: any): Promise<T | null> {
    return this.cache.get<T>(key, options);
  }

  async set<T>(key: string, value: T, options?: any): Promise<void> {
    return this.cache.set(key, value, options);
  }

  async delete(key: string): Promise<boolean> {
    return this.cache.delete(key);
  }

  async clear(): Promise<void> {
    return this.cache.clear();
  }

  async getStats(): Promise<any> {
    return this.cache.getStats();
  }

  async getDetailedStats(): Promise<any> {
    return this.cache.getDetailedStats();
  }

  async info(): Promise<any> {
    return this.cache.info();
  }

  async ping(): Promise<boolean> {
    return this.cache.ping();
  }

  // Cache warm-up for common patterns
  async warmUpLLMCache(): Promise<void> {
    console.log('Warming up LLM cache...');
    // Pre-populate with common queries if needed
  }

  async warmUpEmbeddingCache(): Promise<void> {
    console.log('Warming up embedding cache...');
    // Pre-populate with common embedding queries if needed
  }

  async warmUpWebSearchCache(): Promise<void> {
    console.log('Warming up web search cache...');
    // Pre-populate with common search queries if needed
  }

  // Cache invalidation patterns
  async invalidateByTag(tag: string): Promise<number> {
    return await this.cache.deleteByTag(tag);
  }

  async invalidateByPattern(pattern: string): Promise<number> {
    return await this.cache.deleteByPattern(pattern);
  }

  // Health check
  async healthCheck(): Promise<{
    healthy: boolean;
    details: any;
    timestamp: Date;
  }> {
    try {
      const [ping, stats, info] = await Promise.all([
        this.cache.ping(),
        this.cache.getStats(),
        this.cache.info()
      ]);

      return {
        healthy: ping,
        details: {
          stats,
          info,
          configuration: this.configManager.getCacheConfig()
        },
        timestamp: new Date()
      };
    } catch (error) {
      return {
        healthy: false,
        details: {
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        timestamp: new Date()
      };
    }
  }
}

// Cache decorators for other services
export function cached<T extends (...args: any[]) => Promise<any>>(
  keyGenerator: (...args: Parameters<T>) => string,
  options: {
    ttl?: number;
    tags?: string[];
    compress?: boolean;
  } = {}
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const cacheService = CacheService.getInstance();

    descriptor.value = async function (...args: Parameters<T>) {
      const cacheKey = keyGenerator(...args);
      
      // Try to get from cache
      const cached = await cacheService.get(cacheKey);
      if (cached !== null) {
        return cached;
      }

      // Execute original method
      const result = await method.apply(this, args);
      
      // Cache the result
      await cacheService.set(cacheKey, result, options);
      
      return result;
    };

    return descriptor;
  };
}

// Invalidation decorator
export function invalidateCache(
  keyGeneratorOrPattern: string | ((...args: any[]) => string),
  options: {
    pattern?: boolean;
    tags?: string[];
  } = {}
) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    const cacheService = CacheService.getInstance();

    descriptor.value = async function (...args: any[]) {
      const result = await method.apply(this, args);
      
      // Invalidate cache after successful method execution
      if (typeof keyGeneratorOrPattern === 'string') {
        if (options.pattern) {
          await cacheService.invalidateByPattern(keyGeneratorOrPattern);
        } else {
          await cacheService.delete(keyGeneratorOrPattern);
        }
      } else {
        const cacheKey = keyGeneratorOrPattern(...args);
        await cacheService.delete(cacheKey);
      }

      if (options.tags) {
        for (const tag of options.tags) {
          await cacheService.invalidateByTag(tag);
        }
      }
      
      return result;
    };

    return descriptor;
  };
} 