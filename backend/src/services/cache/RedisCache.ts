import { ICacheLayer, CacheOptions, CacheStats } from '../../interfaces/services/ICacheService';
import { createClient, RedisClientType } from 'redis';
import { gzipSync, gunzipSync } from 'zlib';

export interface RedisCacheConfig {
  host: string;
  port: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
  maxRetries?: number;
  retryDelayOnFailover?: number;
  connectTimeout?: number;
  lazyConnect?: boolean;
}

export class RedisCache implements ICacheLayer {
  readonly name = 'redis';
  readonly priority = 2; // Lower priority than memory cache
  readonly defaultTTL = 86400; // 24 hours
  readonly maxSize = undefined; // No specific limit

  private client: RedisClientType | null = null;
  private isConnected = false;
  private keyPrefix: string;
  private stats = {
    hits: 0,
    misses: 0,
    errors: 0,
    sets: 0,
    deletes: 0
  };

  constructor(private config: RedisCacheConfig) {
    this.keyPrefix = config.keyPrefix || 'cache:';
    this.initializeClient();
  }

  private async initializeClient(): Promise<void> {
    try {
      this.client = createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
          connectTimeout: this.config.connectTimeout || 10000,
        },
        password: this.config.password,
        database: this.config.database || 0,
        retryDelayOnFailover: this.config.retryDelayOnFailover || 100,
      });

      this.client.on('error', (error) => {
        console.error('Redis cache error:', error);
        this.isConnected = false;
        this.stats.errors++;
      });

      this.client.on('connect', () => {
        console.log('Redis cache connected');
        this.isConnected = true;
      });

      this.client.on('disconnect', () => {
        console.log('Redis cache disconnected');
        this.isConnected = false;
      });

      if (!this.config.lazyConnect) {
        await this.client.connect();
      }
    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      this.stats.errors++;
    }
  }

  private async ensureConnection(): Promise<void> {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }

    if (!this.isConnected) {
      try {
        await this.client.connect();
      } catch (error) {
        console.error('Failed to connect to Redis:', error);
        this.stats.errors++;
        throw error;
      }
    }
  }

  private formatKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  private formatTagKey(tag: string): string {
    return `${this.keyPrefix}tag:${tag}`;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    try {
      await this.ensureConnection();
      
      const redisKey = this.formatKey(key);
      const result = await this.client!.get(redisKey);
      
      if (!result) {
        this.stats.misses++;
        return null;
      }

      this.stats.hits++;
      
      // Parse the stored data
      const data = JSON.parse(result);
      
      // Handle compressed data
      if (data.compressed) {
        try {
          const compressed = Buffer.from(data.value, 'base64');
          const decompressed = gunzipSync(compressed);
          data.value = JSON.parse(decompressed.toString());
        } catch (error) {
          console.error('Failed to decompress Redis value:', error);
          return null;
        }
      }

      return data.value;
    } catch (error) {
      console.error('Redis get error:', error);
      this.stats.errors++;
      this.stats.misses++;
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      await this.ensureConnection();
      
      const ttl = options.ttl || this.defaultTTL;
      const tags = options.tags || [];
      
      // Prepare data for storage
      let serializedValue = value;
      let compressed = false;
      
      // Compress if needed
      if (options.compress) {
        try {
          const jsonString = JSON.stringify(value);
          if (jsonString.length > 1024) { // Only compress if larger than 1KB
            const compressedData = gzipSync(Buffer.from(jsonString));
            serializedValue = compressedData.toString('base64') as any;
            compressed = true;
          }
        } catch (error) {
          console.error('Failed to compress value, storing uncompressed:', error);
        }
      }

      const dataToStore = {
        value: serializedValue,
        tags,
        compressed,
        createdAt: Date.now()
      };

      const redisKey = this.formatKey(key);
      
      // Store the value with TTL
      if (ttl > 0) {
        await this.client!.setEx(redisKey, ttl, JSON.stringify(dataToStore));
      } else {
        await this.client!.set(redisKey, JSON.stringify(dataToStore));
      }

      // Index by tags
      await this.indexByTags(key, tags, ttl);
      
      this.stats.sets++;
    } catch (error) {
      console.error('Redis set error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      await this.ensureConnection();
      
      // Get tags first for cleanup
      const data = await this.get(key);
      
      const redisKey = this.formatKey(key);
      const result = await this.client!.del(redisKey);
      
      // Clean up tag indices
      if (data && typeof data === 'object' && 'tags' in data) {
        await this.removeFromTagIndices(key, (data as any).tags);
      }
      
      this.stats.deletes++;
      return result > 0;
    } catch (error) {
      console.error('Redis delete error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.ensureConnection();
      
      const redisKey = this.formatKey(key);
      const result = await this.client!.exists(redisKey);
      return result > 0;
    } catch (error) {
      console.error('Redis exists error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    
    if (keys.length === 0) {
      return result;
    }

    try {
      await this.ensureConnection();
      
      const redisKeys = keys.map(key => this.formatKey(key));
      const values = await this.client!.mGet(redisKeys);
      
      for (let i = 0; i < keys.length; i++) {
        const value = values[i];
        if (value) {
          try {
            const data = JSON.parse(value);
            let finalValue = data.value;
            
            if (data.compressed) {
              const compressed = Buffer.from(data.value, 'base64');
              const decompressed = gunzipSync(compressed);
              finalValue = JSON.parse(decompressed.toString());
            }
            
            result.set(keys[i], finalValue);
            this.stats.hits++;
          } catch (error) {
            console.error('Failed to parse cached value:', error);
            result.set(keys[i], null);
            this.stats.misses++;
          }
        } else {
          result.set(keys[i], null);
          this.stats.misses++;
        }
      }
    } catch (error) {
      console.error('Redis getMany error:', error);
      this.stats.errors++;
      // Return all null values
      for (const key of keys) {
        result.set(key, null);
      }
    }
    
    return result;
  }

  async setMany<T>(items: Map<string, T>, options?: CacheOptions): Promise<void> {
    if (items.size === 0) {
      return;
    }

    try {
      await this.ensureConnection();
      
      const pipeline = this.client!.multi();
      const ttl = options?.ttl || this.defaultTTL;
      
      for (const [key, value] of items) {
        const dataToStore = {
          value,
          tags: options?.tags || [],
          compressed: false,
          createdAt: Date.now()
        };
        
        const redisKey = this.formatKey(key);
        
        if (ttl > 0) {
          pipeline.setEx(redisKey, ttl, JSON.stringify(dataToStore));
        } else {
          pipeline.set(redisKey, JSON.stringify(dataToStore));
        }
      }
      
      await pipeline.exec();
      this.stats.sets += items.size;
    } catch (error) {
      console.error('Redis setMany error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    if (keys.length === 0) {
      return 0;
    }

    try {
      await this.ensureConnection();
      
      const redisKeys = keys.map(key => this.formatKey(key));
      const result = await this.client!.del(redisKeys);
      
      this.stats.deletes += result;
      return result;
    } catch (error) {
      console.error('Redis deleteMany error:', error);
      this.stats.errors++;
      return 0;
    }
  }

  async deleteByPattern(pattern: string): Promise<number> {
    try {
      await this.ensureConnection();
      
      const redisPattern = this.formatKey(pattern);
      const keys = await this.client!.keys(redisPattern);
      
      if (keys.length === 0) {
        return 0;
      }
      
      const result = await this.client!.del(keys);
      this.stats.deletes += result;
      return result;
    } catch (error) {
      console.error('Redis deleteByPattern error:', error);
      this.stats.errors++;
      return 0;
    }
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    try {
      await this.ensureConnection();
      
      const redisPattern = this.formatKey(pattern);
      const keys = await this.client!.keys(redisPattern);
      
      // Remove prefix from keys
      return keys.map(key => key.substring(this.keyPrefix.length));
    } catch (error) {
      console.error('Redis getKeysByPattern error:', error);
      this.stats.errors++;
      return [];
    }
  }

  async deleteByTag(tag: string): Promise<number> {
    try {
      await this.ensureConnection();
      
      const tagKey = this.formatTagKey(tag);
      const keys = await this.client!.sMembers(tagKey);
      
      if (keys.length === 0) {
        return 0;
      }
      
      // Delete the keys and the tag index
      const redisKeys = keys.map(key => this.formatKey(key));
      const pipeline = this.client!.multi();
      
      pipeline.del(redisKeys);
      pipeline.del(tagKey);
      
      const results = await pipeline.exec();
      const deletedCount = results?.[0] as number || 0;
      
      this.stats.deletes += deletedCount;
      return deletedCount;
    } catch (error) {
      console.error('Redis deleteByTag error:', error);
      this.stats.errors++;
      return 0;
    }
  }

  async getKeysByTag(tag: string): Promise<string[]> {
    try {
      await this.ensureConnection();
      
      const tagKey = this.formatTagKey(tag);
      return await this.client!.sMembers(tagKey);
    } catch (error) {
      console.error('Redis getKeysByTag error:', error);
      this.stats.errors++;
      return [];
    }
  }

  async clear(): Promise<void> {
    try {
      await this.ensureConnection();
      
      const pattern = this.formatKey('*');
      const keys = await this.client!.keys(pattern);
      
      if (keys.length > 0) {
        await this.client!.del(keys);
      }
      
      // Also clear tag indices
      const tagPattern = this.formatTagKey('*');
      const tagKeys = await this.client!.keys(tagPattern);
      
      if (tagKeys.length > 0) {
        await this.client!.del(tagKeys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async flush(): Promise<void> {
    try {
      await this.ensureConnection();
      await this.client!.flushDb();
    } catch (error) {
      console.error('Redis flush error:', error);
      this.stats.errors++;
      throw error;
    }
  }

  async getStats(): Promise<CacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    try {
      const info = await this.info();
      
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        memoryUsage: info.memoryUsage || 0,
        itemCount: info.keyCount || 0,
        evictions: info.evictions || 0,
        lastAccess: new Date()
      };
    } catch (error) {
      return {
        hits: this.stats.hits,
        misses: this.stats.misses,
        hitRate,
        memoryUsage: 0,
        itemCount: 0,
        evictions: 0,
        lastAccess: new Date()
      };
    }
  }

  async getSize(): Promise<number> {
    try {
      await this.ensureConnection();
      
      const pattern = this.formatKey('*');
      const keys = await this.client!.keys(pattern);
      return keys.length;
    } catch (error) {
      console.error('Redis getSize error:', error);
      this.stats.errors++;
      return 0;
    }
  }

  async warmUp(keys: string[], loader: (key: string) => Promise<any>): Promise<void> {
    const promises = keys.map(async (key) => {
      try {
        if (!(await this.exists(key))) {
          const value = await loader(key);
          await this.set(key, value, { ttl: this.defaultTTL });
        }
      } catch (error) {
        console.warn(`Failed to warm up Redis cache for key ${key}:`, error);
      }
    });
    
    await Promise.all(promises);
  }

  async preload(data: Map<string, any>, options?: CacheOptions): Promise<void> {
    await this.setMany(data, options);
  }

  async ping(): Promise<boolean> {
    try {
      await this.ensureConnection();
      const result = await this.client!.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping error:', error);
      this.stats.errors++;
      return false;
    }
  }

  async info(): Promise<Record<string, any>> {
    try {
      await this.ensureConnection();
      
      const info = await this.client!.info();
      const lines = info.split('\r\n');
      const result: Record<string, any> = {
        type: 'redis',
        connected: this.isConnected,
        config: this.config,
        stats: this.stats
      };
      
      // Parse Redis info
      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':');
          const numValue = parseFloat(value);
          result[key] = isNaN(numValue) ? value : numValue;
        }
      }
      
      return result;
    } catch (error) {
      console.error('Redis info error:', error);
      this.stats.errors++;
      return {
        type: 'redis',
        connected: this.isConnected,
        config: this.config,
        stats: this.stats,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async isHealthy(): Promise<boolean> {
    return this.isConnected && await this.ping();
  }

  async cleanup(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.disconnect();
      }
    } catch (error) {
      console.error('Redis cleanup error:', error);
    }
  }

  async resize(newSize: number): Promise<void> {
    // Redis doesn't have a built-in size limit like our in-memory cache
    // This could be implemented with custom logic if needed
    console.warn('Redis resize not implemented - Redis manages memory automatically');
  }

  private async indexByTags(key: string, tags: string[], ttl: number): Promise<void> {
    if (tags.length === 0) {
      return;
    }

    try {
      const pipeline = this.client!.multi();
      
      for (const tag of tags) {
        const tagKey = this.formatTagKey(tag);
        pipeline.sAdd(tagKey, key);
        
        // Set TTL on tag index (slightly longer than data TTL)
        if (ttl > 0) {
          pipeline.expire(tagKey, ttl + 300); // 5 minutes buffer
        }
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Failed to index by tags:', error);
    }
  }

  private async removeFromTagIndices(key: string, tags: string[]): Promise<void> {
    if (tags.length === 0) {
      return;
    }

    try {
      const pipeline = this.client!.multi();
      
      for (const tag of tags) {
        const tagKey = this.formatTagKey(tag);
        pipeline.sRem(tagKey, key);
      }
      
      await pipeline.exec();
    } catch (error) {
      console.error('Failed to remove from tag indices:', error);
    }
  }
} 