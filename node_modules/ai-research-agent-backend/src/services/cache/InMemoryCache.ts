import { ICacheLayer, CacheOptions, CacheStats, CacheItem } from '../../interfaces/services/ICacheService';
import { gzipSync, gunzipSync } from 'zlib';

export class InMemoryCache implements ICacheLayer {
  readonly name = 'memory';
  readonly priority = 1; // Higher priority than Redis
  readonly defaultTTL = 3600; // 1 hour
  
  private cache = new Map<string, CacheItem<any>>();
  private accessOrder = new Map<string, number>(); // For LRU tracking
  private tagIndex = new Map<string, Set<string>>(); // Tag to keys mapping
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    sets: 0,
    deletes: 0
  };
  private accessCounter = 0;

  constructor(
    public readonly maxSize: number = 10000,
    private readonly maxMemoryMB: number = 100
  ) {
    // Cleanup expired items every 5 minutes
    setInterval(() => this.cleanupExpired(), 5 * 60 * 1000);
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const item = this.cache.get(key);
    
    if (!item) {
      this.stats.misses++;
      return null;
    }

    // Check expiration
    if (item.expiresAt < Date.now()) {
      this.cache.delete(key);
      this.removeFromTagIndex(key, item.tags);
      this.stats.misses++;
      return null;
    }

    // Update access tracking
    this.stats.hits++;
    item.accessCount++;
    item.lastAccess = Date.now();
    this.accessOrder.set(key, ++this.accessCounter);

    // Decompress if needed
    let value = item.value;
    if (value && typeof value === 'string' && value.startsWith('gzip:')) {
      try {
        const compressed = Buffer.from(value.slice(5), 'base64');
        const decompressed = gunzipSync(compressed);
        value = JSON.parse(decompressed.toString());
      } catch (error) {
        console.error('Failed to decompress cached value:', error);
        return null;
      }
    }

    return value;
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const ttl = options.ttl || this.defaultTTL;
    const expiresAt = Date.now() + (ttl * 1000);
    const tags = options.tags || [];
    
    // Serialize and optionally compress
    let serializedValue = value;
    let size = this.estimateSize(value);
    
    if (options.compress && size > 1024) { // Compress if larger than 1KB
      try {
        const jsonString = JSON.stringify(value);
        const compressed = gzipSync(Buffer.from(jsonString));
        serializedValue = 'gzip:' + compressed.toString('base64') as any;
        size = this.estimateSize(serializedValue);
      } catch (error) {
        console.error('Failed to compress value, storing uncompressed:', error);
      }
    }

    const item: CacheItem<T> = {
      value: serializedValue,
      expiresAt,
      createdAt: Date.now(),
      accessCount: 0,
      lastAccess: Date.now(),
      tags,
      size
    };

    // Check if we need to evict items
    await this.ensureCapacity(size);

    // Store the item
    this.cache.set(key, item);
    this.accessOrder.set(key, ++this.accessCounter);
    this.addToTagIndex(key, tags);
    this.stats.sets++;
  }

  async delete(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    this.cache.delete(key);
    this.accessOrder.delete(key);
    this.removeFromTagIndex(key, item.tags);
    this.stats.deletes++;
    return true;
  }

  async exists(key: string): Promise<boolean> {
    const item = this.cache.get(key);
    if (!item) {
      return false;
    }

    // Check expiration
    if (item.expiresAt < Date.now()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
    const result = new Map<string, T | null>();
    
    for (const key of keys) {
      const value = await this.get<T>(key);
      result.set(key, value);
    }
    
    return result;
  }

  async setMany<T>(items: Map<string, T>, options?: CacheOptions): Promise<void> {
    for (const [key, value] of items) {
      await this.set(key, value, options);
    }
  }

  async deleteMany(keys: string[]): Promise<number> {
    let deletedCount = 0;
    
    for (const key of keys) {
      if (await this.delete(key)) {
        deletedCount++;
      }
    }
    
    return deletedCount;
  }

  async deleteByPattern(pattern: string): Promise<number> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    return await this.deleteMany(keysToDelete);
  }

  async getKeysByPattern(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    const matchingKeys: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }
    
    return matchingKeys;
  }

  async deleteByTag(tag: string): Promise<number> {
    const keys = this.tagIndex.get(tag);
    if (!keys) {
      return 0;
    }
    
    const keysArray = Array.from(keys);
    return await this.deleteMany(keysArray);
  }

  async getKeysByTag(tag: string): Promise<string[]> {
    const keys = this.tagIndex.get(tag);
    return keys ? Array.from(keys) : [];
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.accessOrder.clear();
    this.tagIndex.clear();
    this.accessCounter = 0;
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      sets: 0,
      deletes: 0
    };
  }

  async flush(): Promise<void> {
    await this.clear();
  }

  async getStats(): Promise<CacheStats> {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;
    
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate,
      memoryUsage: this.getMemoryUsage(),
      itemCount: this.cache.size,
      evictions: this.stats.evictions,
      lastAccess: new Date()
    };
  }

  async getSize(): Promise<number> {
    return this.cache.size;
  }

  async warmUp(keys: string[], loader: (key: string) => Promise<any>): Promise<void> {
    const promises = keys.map(async (key) => {
      if (!(await this.exists(key))) {
        try {
          const value = await loader(key);
          await this.set(key, value, { ttl: this.defaultTTL });
        } catch (error) {
          console.warn(`Failed to warm up cache for key ${key}:`, error);
        }
      }
    });
    
    await Promise.all(promises);
  }

  async preload(data: Map<string, any>, options?: CacheOptions): Promise<void> {
    await this.setMany(data, options);
  }

  async ping(): Promise<boolean> {
    return true; // In-memory cache is always available
  }

  async info(): Promise<Record<string, any>> {
    const stats = await this.getStats();
    
    return {
      type: 'memory',
      maxSize: this.maxSize,
      maxMemoryMB: this.maxMemoryMB,
      currentSize: this.cache.size,
      ...stats
    };
  }

  async isHealthy(): Promise<boolean> {
    return this.getMemoryUsage() < this.maxMemoryMB * 1024 * 1024;
  }

  async cleanup(): Promise<void> {
    this.cleanupExpired();
  }

  async resize(newSize: number): Promise<void> {
    // If reducing size, evict excess items
    if (newSize < this.cache.size) {
      const itemsToEvict = this.cache.size - newSize;
      await this.evictLRUItems(itemsToEvict);
    }
  }

  private async ensureCapacity(newItemSize: number): Promise<void> {
    // Check memory limit
    const currentMemory = this.getMemoryUsage();
    const maxMemoryBytes = this.maxMemoryMB * 1024 * 1024;
    
    if (currentMemory + newItemSize > maxMemoryBytes) {
      await this.evictToFreeMemory(newItemSize);
    }
    
    // Check item count limit
    if (this.cache.size >= this.maxSize) {
      await this.evictLRUItems(1);
    }
  }

  private async evictLRUItems(count: number): Promise<void> {
    // Sort by access order (oldest first)
    const sortedByAccess = Array.from(this.accessOrder.entries())
      .sort(([, a], [, b]) => a - b)
      .slice(0, count);
    
    for (const [key] of sortedByAccess) {
      await this.delete(key);
      this.stats.evictions++;
    }
  }

  private async evictToFreeMemory(targetBytes: number): Promise<void> {
    let freedBytes = 0;
    const sortedByAccess = Array.from(this.accessOrder.entries())
      .sort(([, a], [, b]) => a - b);
    
    for (const [key] of sortedByAccess) {
      const item = this.cache.get(key);
      if (item) {
        freedBytes += item.size;
        await this.delete(key);
        this.stats.evictions++;
        
        if (freedBytes >= targetBytes) {
          break;
        }
      }
    }
  }

  private cleanupExpired(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, item] of this.cache) {
      if (item.expiresAt < now) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
      this.accessOrder.delete(key);
      const item = this.cache.get(key);
      if (item) {
        this.removeFromTagIndex(key, item.tags);
      }
    }
  }

  private addToTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      if (!this.tagIndex.has(tag)) {
        this.tagIndex.set(tag, new Set());
      }
      this.tagIndex.get(tag)!.add(key);
    }
  }

  private removeFromTagIndex(key: string, tags: string[]): void {
    for (const tag of tags) {
      const tagKeys = this.tagIndex.get(tag);
      if (tagKeys) {
        tagKeys.delete(key);
        if (tagKeys.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  private estimateSize(value: any): number {
    if (value === null || value === undefined) {
      return 8;
    }
    
    if (typeof value === 'string') {
      return value.length * 2; // Rough estimate for UTF-16
    }
    
    if (typeof value === 'number') {
      return 8;
    }
    
    if (typeof value === 'boolean') {
      return 4;
    }
    
    // For objects, use JSON string length as approximation
    try {
      return JSON.stringify(value).length * 2;
    } catch {
      return 1024; // Default size for non-serializable objects
    }
  }

  private getMemoryUsage(): number {
    let total = 0;
    
    for (const item of this.cache.values()) {
      total += item.size;
    }
    
    return total;
  }
} 