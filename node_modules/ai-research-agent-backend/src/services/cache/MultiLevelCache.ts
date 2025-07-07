import { ICacheService, ICacheLayer, CacheOptions, CacheStats } from '../../interfaces/services/ICacheService';
import { InMemoryCache } from './InMemoryCache';
import { RedisCache, RedisCacheConfig } from './RedisCache';

export interface MultiLevelCacheConfig {
  memory?: {
    maxSize?: number;
    maxMemoryMB?: number;
  };
  redis?: RedisCacheConfig & {
    enabled?: boolean;
  };
  writeThrough?: boolean; // Write to all layers simultaneously
  readPreference?: 'memory-first' | 'redis-first' | 'parallel';
  syncStrategy?: 'lazy' | 'immediate' | 'scheduled';
}

export class MultiLevelCache implements ICacheService {
  private layers: ICacheLayer[] = [];
  private memoryCache: InMemoryCache;
  private redisCache?: RedisCache;
  private config: MultiLevelCacheConfig;
  
  private stats = {
    totalRequests: 0,
    memoryHits: 0,
    redisHits: 0,
    misses: 0,
    promotions: 0, // Items promoted from Redis to memory
    demotions: 0,  // Items evicted from memory to Redis only
    syncOperations: 0
  };

  constructor(config: MultiLevelCacheConfig = {}) {
    this.config = {
      writeThrough: true,
      readPreference: 'memory-first',
      syncStrategy: 'immediate',
      ...config
    };

    // Initialize memory cache (always present)
    this.memoryCache = new InMemoryCache(
      config.memory?.maxSize || 10000,
      config.memory?.maxMemoryMB || 100
    );
    this.layers.push(this.memoryCache);

    // Initialize Redis cache if configured
    if (config.redis?.enabled !== false && config.redis) {
      this.redisCache = new RedisCache(config.redis);
      this.layers.push(this.redisCache);
    }

    // Sort layers by priority (higher priority first)
    this.layers.sort((a, b) => a.priority - b.priority);

    // Setup sync operations if configured
    if (this.config.syncStrategy === 'scheduled') {
      this.setupScheduledSync();
    }
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    this.stats.totalRequests++;

    if (this.config.readPreference === 'parallel') {
      return this.getParallel<T>(key, options);
    }

    // Try each layer in priority order
    for (const layer of this.layers) {
      try {
        const value = await layer.get<T>(key, options);
        
        if (value !== null) {
          // Track hits by layer
          if (layer === this.memoryCache) {
            this.stats.memoryHits++;
          } else if (layer === this.redisCache) {
            this.stats.redisHits++;
          }

          // Promote to higher priority layers if found in lower priority
          await this.promoteToHigherLayers(key, value, layer, options);
          
          return value;
        }
      } catch (error) {
        console.error(`Error getting key ${key} from ${layer.name}:`, error);
        // Continue to next layer on error
      }
    }

    this.stats.misses++;
    return null;
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const errors: Error[] = [];

    if (this.config.writeThrough) {
      // Write to all layers simultaneously
      const promises = this.layers.map(async (layer) => {
        try {
          await layer.set(key, value, options);
        } catch (error) {
          console.error(`Error setting key ${key} in ${layer.name}:`, error);
          errors.push(error as Error);
        }
      });

      await Promise.all(promises);
    } else {
      // Write to highest priority layer first, then background sync to others
      try {
        await this.layers[0].set(key, value, options);
        
        if (this.config.syncStrategy === 'immediate') {
          // Background sync to other layers
          this.syncToLowerLayers(key, value, this.layers[0], options).catch(console.error);
        }
      } catch (error) {
        errors.push(error as Error);
      }
    }

    if (errors.length === this.layers.length) {
      throw new Error(`Failed to set key ${key} in all cache layers: ${errors.map(e => e.message).join(', ')}`);
    }
  }

  async delete(key: string): Promise<boolean> {
    let anyDeleted = false;
    const promises = this.layers.map(async (layer) => {
      try {
        const deleted = await layer.delete(key);
        if (deleted) {
          anyDeleted = true;
        }
        return deleted;
      } catch (error) {
        console.error(`Error deleting key ${key} from ${layer.name}:`, error);
        return false;
      }
    });

    await Promise.all(promises);
    return anyDeleted;
  }

  async exists(key: string): Promise<boolean> {
    // Check highest priority layer first
    for (const layer of this.layers) {
      try {
        if (await layer.exists(key)) {
          return true;
        }
      } catch (error) {
        console.error(`Error checking existence of key ${key} in ${layer.name}:`, error);
      }
    }
    return false;
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    const remainingKeys = new Set(keys);

    // Try each layer in priority order
    for (const layer of this.layers) {
      if (remainingKeys.size === 0) break;

      try {
        const keysArray = Array.from(remainingKeys);
        const layerResults = await layer.getMany<T>(keysArray);

        for (const [key, value] of layerResults) {
          if (value !== null) {
            result.set(key, value);
            remainingKeys.delete(key);
            
            // Track stats
            if (layer === this.memoryCache) {
              this.stats.memoryHits++;
            } else if (layer === this.redisCache) {
              this.stats.redisHits++;
            }
          }
        }
      } catch (error) {
        console.error(`Error getting multiple keys from ${layer.name}:`, error);
      }
    }

    // Set null for remaining keys
    for (const key of remainingKeys) {
      result.set(key, null);
      this.stats.misses++;
    }

    this.stats.totalRequests += keys.length;
    return result;
  }

  async setMany<T>(items: Map<string, T>, options?: CacheOptions): Promise<void> {
    if (this.config.writeThrough) {
      const promises = this.layers.map(layer => 
        layer.setMany(items, options).catch(error => 
          console.error(`Error setting multiple keys in ${layer.name}:`, error)
        )
      );
      await Promise.all(promises);
    } else {
      // Set in highest priority layer first
      await this.layers[0].setMany(items, options);
      
      if (this.config.syncStrategy === 'immediate') {
        // Background sync to other layers
        this.syncMultipleToLowerLayers(items, this.layers[0], options).catch(console.error);
      }
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    let totalDeleted = 0;
    const promises = this.layers.map(async (layer) => {
      try {
        const deleted = await layer.deleteMany(keys);
        totalDeleted = Math.max(totalDeleted, deleted); // Take highest count
        return deleted;
      } catch (error) {
        console.error(`Error deleting multiple keys from ${layer.name}:`, error);
        return 0;
      }
    });

    await Promise.all(promises);
    return totalDeleted;
  }

  async deleteByPattern(pattern: string): Promise<number> {
    let totalDeleted = 0;
    const promises = this.layers.map(async (layer) => {
      try {
        const deleted = await layer.deleteByPattern(pattern);
        totalDeleted = Math.max(totalDeleted, deleted);
        return deleted;
      } catch (error) {
        console.error(`Error deleting by pattern from ${layer.name}:`, error);
        return 0;
      }
    });

    await Promise.all(promises);
    return totalDeleted;
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    const allKeys = new Set<string>();
    
    for (const layer of this.layers) {
      try {
        const keys = await layer.getKeysByPattern(pattern);
        keys.forEach(key => allKeys.add(key));
      } catch (error) {
        console.error(`Error getting keys by pattern from ${layer.name}:`, error);
      }
    }
    
    return Array.from(allKeys);
  }

  async deleteByTag(tag: string): Promise<number> {
    let totalDeleted = 0;
    const promises = this.layers.map(async (layer) => {
      try {
        const deleted = await layer.deleteByTag(tag);
        totalDeleted = Math.max(totalDeleted, deleted);
        return deleted;
      } catch (error) {
        console.error(`Error deleting by tag from ${layer.name}:`, error);
        return 0;
      }
    });

    await Promise.all(promises);
    return totalDeleted;
  }

  async getKeysByTag(tag: string): Promise<string[]> {
    const allKeys = new Set<string>();
    
    for (const layer of this.layers) {
      try {
        const keys = await layer.getKeysByTag(tag);
        keys.forEach(key => allKeys.add(key));
      } catch (error) {
        console.error(`Error getting keys by tag from ${layer.name}:`, error);
      }
    }
    
    return Array.from(allKeys);
  }

  async clear(): Promise<void> {
    const promises = this.layers.map(layer => 
      layer.clear().catch(error => 
        console.error(`Error clearing ${layer.name}:`, error)
      )
    );
    await Promise.all(promises);
  }

  async flush(): Promise<void> {
    const promises = this.layers.map(layer => 
      layer.flush().catch(error => 
        console.error(`Error flushing ${layer.name}:`, error)
      )
    );
    await Promise.all(promises);
  }

  async getStats(): Promise<CacheStats> {
    const layerStats = await Promise.all(
      this.layers.map(async (layer) => {
        try {
          return await layer.getStats();
        } catch (error) {
          console.error(`Error getting stats from ${layer.name}:`, error);
          return {
            hits: 0,
            misses: 0,
            hitRate: 0,
            memoryUsage: 0,
            itemCount: 0,
            evictions: 0,
            lastAccess: new Date()
          };
        }
      })
    );

    const totalHits = this.stats.memoryHits + this.stats.redisHits;
    const totalRequests = this.stats.totalRequests;
    const overallHitRate = totalRequests > 0 ? totalHits / totalRequests : 0;

    return {
      hits: totalHits,
      misses: this.stats.misses,
      hitRate: overallHitRate,
      memoryUsage: layerStats.reduce((sum, stats) => sum + stats.memoryUsage, 0),
      itemCount: Math.max(...layerStats.map(stats => stats.itemCount)),
      evictions: layerStats.reduce((sum, stats) => sum + stats.evictions, 0),
      lastAccess: new Date()
    };
  }

  async getSize(): Promise<number> {
    const sizes = await Promise.all(
      this.layers.map(layer => layer.getSize().catch(() => 0))
    );
    return Math.max(...sizes);
  }

  async warmUp(keys: string[], loader: (key: string) => Promise<any>): Promise<void> {
    // Warm up all layers
    const promises = this.layers.map(layer => 
      layer.warmUp(keys, loader).catch(error => 
        console.error(`Error warming up ${layer.name}:`, error)
      )
    );
    await Promise.all(promises);
  }

  async preload(data: Map<string, any>, options?: CacheOptions): Promise<void> {
    // Preload to all layers
    const promises = this.layers.map(layer => 
      layer.preload(data, options).catch(error => 
        console.error(`Error preloading ${layer.name}:`, error)
      )
    );
    await Promise.all(promises);
  }

  async ping(): Promise<boolean> {
    const results = await Promise.all(
      this.layers.map(layer => layer.ping().catch(() => false))
    );
    return results.some(result => result); // At least one layer should be healthy
  }

  async info(): Promise<Record<string, any>> {
    const layerInfos = await Promise.all(
      this.layers.map(async (layer) => {
        try {
          return { [layer.name]: await layer.info() };
        } catch (error) {
          return { [layer.name]: { error: error instanceof Error ? error.message : 'Unknown error' } };
        }
      })
    );

    return {
      type: 'multi-level',
      config: this.config,
      stats: {
        ...this.stats,
        overallHitRate: this.stats.totalRequests > 0 ? 
          (this.stats.memoryHits + this.stats.redisHits) / this.stats.totalRequests : 0
      },
      layers: layerInfos.reduce((acc, info) => ({ ...acc, ...info }), {})
    };
  }

  // Multi-level specific methods
  async getDetailedStats(): Promise<{
    overall: CacheStats;
    layers: Record<string, CacheStats>;
    performance: {
      memoryHitRate: number;
      redisHitRate: number;
      promotionRate: number;
      syncOperations: number;
    };
  }> {
    const overall = await this.getStats();
    const layers: Record<string, CacheStats> = {};
    
    for (const layer of this.layers) {
      try {
        layers[layer.name] = await layer.getStats();
      } catch (error) {
        console.error(`Error getting stats for ${layer.name}:`, error);
      }
    }

    return {
      overall,
      layers,
      performance: {
        memoryHitRate: this.stats.totalRequests > 0 ? this.stats.memoryHits / this.stats.totalRequests : 0,
        redisHitRate: this.stats.totalRequests > 0 ? this.stats.redisHits / this.stats.totalRequests : 0,
        promotionRate: this.stats.totalRequests > 0 ? this.stats.promotions / this.stats.totalRequests : 0,
        syncOperations: this.stats.syncOperations
      }
    };
  }

  async syncLayers(): Promise<void> {
    if (!this.redisCache) return;

    try {
      // Get all keys from Redis and sync to memory if missing
      const redisKeys = await this.redisCache.getKeysByPattern('*');
      
      for (const key of redisKeys) {
        if (!(await this.memoryCache.exists(key))) {
          const value = await this.redisCache.get(key);
          if (value !== null) {
            await this.memoryCache.set(key, value, { ttl: 3600 }); // 1 hour default
            this.stats.promotions++;
          }
        }
      }
      
      this.stats.syncOperations++;
    } catch (error) {
      console.error('Error syncing cache layers:', error);
    }
  }

  private async getParallel<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const promises = this.layers.map(layer => 
      layer.get<T>(key, options).catch(() => null)
    );
    
    const results = await Promise.all(promises);
    
    // Return first non-null result
    for (let i = 0; i < results.length; i++) {
      if (results[i] !== null) {
        // Track hits
        if (this.layers[i] === this.memoryCache) {
          this.stats.memoryHits++;
        } else if (this.layers[i] === this.redisCache) {
          this.stats.redisHits++;
        }
        return results[i];
      }
    }
    
    this.stats.misses++;
    return null;
  }

  private async promoteToHigherLayers<T>(
    key: string, 
    value: T, 
    sourceLayer: ICacheLayer, 
    options?: CacheOptions
  ): Promise<void> {
    const sourceIndex = this.layers.indexOf(sourceLayer);
    
    // Promote to higher priority layers (lower index)
    for (let i = 0; i < sourceIndex; i++) {
      try {
        await this.layers[i].set(key, value, options);
        this.stats.promotions++;
      } catch (error) {
        console.error(`Error promoting key ${key} to ${this.layers[i].name}:`, error);
      }
    }
  }

  private async syncToLowerLayers<T>(
    key: string, 
    value: T, 
    sourceLayer: ICacheLayer, 
    options?: CacheOptions
  ): Promise<void> {
    const sourceIndex = this.layers.indexOf(sourceLayer);
    
    // Sync to lower priority layers (higher index)
    for (let i = sourceIndex + 1; i < this.layers.length; i++) {
      try {
        await this.layers[i].set(key, value, options);
        this.stats.syncOperations++;
      } catch (error) {
        console.error(`Error syncing key ${key} to ${this.layers[i].name}:`, error);
      }
    }
  }

  private async syncMultipleToLowerLayers<T>(
    items: Map<string, T>, 
    sourceLayer: ICacheLayer, 
    options?: CacheOptions
  ): Promise<void> {
    const sourceIndex = this.layers.indexOf(sourceLayer);
    
    for (let i = sourceIndex + 1; i < this.layers.length; i++) {
      try {
        await this.layers[i].setMany(items, options);
        this.stats.syncOperations++;
      } catch (error) {
        console.error(`Error syncing multiple keys to ${this.layers[i].name}:`, error);
      }
    }
  }

  private setupScheduledSync(): void {
    // Sync layers every 5 minutes
    setInterval(() => {
      this.syncLayers().catch(error => 
        console.error('Scheduled sync failed:', error)
      );
    }, 5 * 60 * 1000);
  }
} 