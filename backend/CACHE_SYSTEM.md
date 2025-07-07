# Multi-Level Cache System

## Overview

The AI Research Agent backend now includes an advanced multi-level caching system that combines in-memory and Redis caching for optimal performance. This system provides:

- **Two-tier caching**: Fast in-memory cache + persistent Redis cache
- **Automatic promotion**: Items accessed from Redis are promoted to memory
- **Intelligent invalidation**: Pattern-based and tag-based cache invalidation
- **Compression support**: Automatic compression for large values
- **Statistics and monitoring**: Detailed performance metrics
- **Graceful degradation**: Works with memory-only if Redis is unavailable

## Architecture

```
┌─────────────────┐
│   Application   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  CacheService   │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│ MultiLevelCache │
└─────────────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌─────────┐ ┌─────────┐
│ Memory  │ │  Redis  │
│ Cache   │ │ Cache   │
│(Priority│ │(Priority│
│   1)    │ │   2)    │
└─────────┘ └─────────┘
```

## Configuration

Add these environment variables to your `.env` file:

```env
# Cache System
CACHE_ENABLED=true

# In-memory cache
CACHE_MEMORY_MAX_SIZE=10000
CACHE_MEMORY_MAX_MB=100

# Redis cache
CACHE_REDIS_ENABLED=false
CACHE_REDIS_HOST=localhost
CACHE_REDIS_PORT=6379
CACHE_REDIS_PASSWORD=
CACHE_REDIS_DB=0
CACHE_REDIS_KEY_PREFIX=cache:

# Cache behavior
CACHE_WRITE_THROUGH=true
CACHE_READ_PREFERENCE=memory-first
CACHE_SYNC_STRATEGY=immediate
CACHE_DEFAULT_TTL=3600
```

### Configuration Options

#### Read Preferences
- `memory-first`: Check memory cache first, then Redis (default)
- `redis-first`: Check Redis first, then memory
- `parallel`: Check both simultaneously and return first result

#### Sync Strategies
- `immediate`: Write to all layers simultaneously (default)
- `lazy`: Write to primary layer, sync to others on demand
- `scheduled`: Background sync every 5 minutes

#### Write Strategies
- `write-through`: Write to all layers (default)
- `write-back`: Write to primary layer only, sync later

## Usage

### Basic Usage

```typescript
import { CacheService } from './services/CacheService';

const cacheService = CacheService.getInstance();

// Store data
await cacheService.set('user:123', userData, { 
  ttl: 3600, 
  tags: ['user', 'profile'] 
});

// Retrieve data
const user = await cacheService.get<UserData>('user:123');

// Delete data
await cacheService.delete('user:123');
```

### Advanced Usage

```typescript
// Cache with compression for large objects
await cacheService.set('large-dataset', bigData, { 
  ttl: 7200, 
  compress: true,
  tags: ['dataset', 'analytics']
});

// Batch operations
const userMap = new Map([
  ['user:1', user1],
  ['user:2', user2]
]);
await cacheService.setMany(userMap, { ttl: 3600 });

// Pattern-based invalidation
await cacheService.invalidateByPattern('user:*');

// Tag-based invalidation
await cacheService.invalidateByTag('profile');
```

### Decorators

Use decorators for automatic caching:

```typescript
import { cached, invalidateCache } from './services/CacheService';

class UserService {
  @cached(
    (userId: string) => `user:${userId}`,
    { ttl: 3600, tags: ['user'] }
  )
  async getUser(userId: string): Promise<User> {
    // Expensive operation
    return await this.database.findUser(userId);
  }

  @invalidateCache(
    (userId: string) => `user:${userId}`,
    { tags: ['user'] }
  )
  async updateUser(userId: string, data: Partial<User>): Promise<User> {
    return await this.database.updateUser(userId, data);
  }
}
```

## API Endpoints

The cache system exposes several API endpoints for monitoring and management:

### GET /api/cache/stats
Get detailed cache statistics including hit rates, memory usage, and layer performance.

```bash
curl http://localhost:3001/api/cache/stats
```

### GET /api/cache/info
Get cache configuration and system information.

```bash
curl http://localhost:3001/api/cache/info
```

### GET /api/cache/health
Check cache system health including Redis connectivity.

```bash
curl http://localhost:3001/api/cache/health
```

### POST /api/cache/clear
Clear all cache data (requires confirmation).

```bash
curl -X POST http://localhost:3001/api/cache/clear \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

### POST /api/cache/invalidate
Invalidate cache by pattern or tag.

```bash
# By pattern
curl -X POST http://localhost:3001/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"pattern": "user:*"}'

# By tag
curl -X POST http://localhost:3001/api/cache/invalidate \
  -H "Content-Type: application/json" \
  -d '{"tag": "profile"}'
```

### POST /api/cache/warmup
Warm up cache with common data.

```bash
# Warm up LLM cache
curl -X POST http://localhost:3001/api/cache/warmup \
  -H "Content-Type: application/json" \
  -d '{"type": "llm"}'

# Warm up embedding cache
curl -X POST http://localhost:3001/api/cache/warmup \
  -H "Content-Type: application/json" \
  -d '{"type": "embedding"}'
```

## Performance Features

### LRU Eviction
The in-memory cache uses Least Recently Used (LRU) eviction when limits are reached.

### Compression
Large values (>1KB) are automatically compressed using gzip when the `compress` option is enabled.

### Statistics Tracking
- Hit/miss rates per layer
- Memory usage monitoring
- Access patterns
- Eviction counts
- Promotion/demotion tracking

### Health Monitoring
- Memory usage tracking
- Redis connectivity monitoring
- Performance metrics
- Automatic cleanup of expired items

## Task Commands

Use the Taskfile for common cache operations:

```bash
# Setup cache system
task cache:setup

# Test cache functionality
task cache:test

# Get cache statistics
task cache:stats

# Check cache health
task cache:health

# Clear cache (with warning)
task cache:clear

# Warm up cache
task cache:warmup

# Redis management
task cache:redis:start
task cache:redis:stop
task cache:redis:status
```

## Best Practices

### Key Naming
Use consistent key patterns:
```
user:{id}
session:{token}
search:{hash}
embedding:{content_hash}
```

### TTL Strategy
- Short TTL (5-15 minutes): Frequently changing data
- Medium TTL (1-6 hours): Semi-static data
- Long TTL (12-24 hours): Static reference data

### Tagging Strategy
Use tags for logical grouping:
```typescript
await cache.set('user:123', user, { 
  tags: ['user', 'profile', 'tenant:abc'] 
});
```

### Compression
Enable compression for:
- Large JSON objects (>1KB)
- Search results
- Report data
- File contents

### Invalidation
- Use patterns for bulk invalidation: `user:*`
- Use tags for logical invalidation: `['user', 'profile']`
- Invalidate on data changes, not reads

## Troubleshooting

### Memory Issues
1. Check memory limits: `CACHE_MEMORY_MAX_MB`
2. Monitor hit rates in `/api/cache/stats`
3. Adjust TTL values
4. Enable compression for large objects

### Redis Issues
1. Check Redis connectivity: `task cache:redis:status`
2. Verify Redis configuration
3. Check Redis logs
4. Test with memory-only mode

### Performance Issues
1. Monitor cache hit rates
2. Adjust read preferences
3. Optimize key patterns
4. Use batch operations where possible

### Common Errors
- `Redis client not initialized`: Check Redis configuration
- `Cache disabled`: Set `CACHE_ENABLED=true`
- `Memory limit exceeded`: Increase `CACHE_MEMORY_MAX_MB`
- `Connection timeout`: Increase `CACHE_REDIS_CONNECT_TIMEOUT`

## Dependencies

The cache system requires:
- `redis`: ^4.6.12 (for Redis support)
- Node.js built-in `zlib` (for compression)

Install Redis dependency:
```bash
npm install redis@^4.6.12
```

## Migration Guide

If upgrading from a system without caching:

1. Install Redis dependency
2. Add cache configuration to environment
3. Initialize ServiceFactory with cache support
4. Add cache endpoints to routes
5. Optionally add caching decorators to services

The system is designed to work seamlessly with existing code - no breaking changes required. 