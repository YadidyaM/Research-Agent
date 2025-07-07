export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  priority?: 'low' | 'medium' | 'high';
  tags?: string[]; // For tag-based invalidation
  compress?: boolean; // Compress large values
  serialize?: boolean; // Custom serialization
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  memoryUsage: number;
  itemCount: number;
  evictions: number;
  lastAccess: Date;
}

export interface CacheKey {
  key: string;
  namespace: string;
  version?: string;
}

export interface CacheItem<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
  accessCount: number;
  lastAccess: number;
  tags: string[];
  size: number;
}

export interface ICacheService {
  // Basic operations
  get<T>(key: string, options?: CacheOptions): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  exists(key: string): Promise<boolean>;
  
  // Batch operations
  getMany<T>(keys: string[]): Promise<Map<string, T | null>>;
  setMany<T>(items: Map<string, T>, options?: CacheOptions): Promise<void>;
  deleteMany(keys: string[]): Promise<number>;
  
  // Pattern-based operations
  deleteByPattern(pattern: string): Promise<number>;
  getKeysByPattern(pattern: string): Promise<string[]>;
  
  // Tag-based operations
  deleteByTag(tag: string): Promise<number>;
  getKeysByTag(tag: string): Promise<string[]>;
  
  // Cache management
  clear(): Promise<void>;
  flush(): Promise<void>;
  
  // Statistics and monitoring
  getStats(): Promise<CacheStats>;
  getSize(): Promise<number>;
  
  // Cache warming
  warmUp(keys: string[], loader: (key: string) => Promise<any>): Promise<void>;
  preload(data: Map<string, any>, options?: CacheOptions): Promise<void>;
  
  // Health and diagnostics
  ping(): Promise<boolean>;
  info(): Promise<Record<string, any>>;
}

export interface ICacheLayer extends ICacheService {
  // Layer-specific properties
  readonly name: string;
  readonly priority: number;
  readonly maxSize?: number;
  readonly defaultTTL: number;
  
  // Layer management
  isHealthy(): Promise<boolean>;
  cleanup(): Promise<void>;
  resize(newSize: number): Promise<void>;
} 