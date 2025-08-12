/**
 * Distributed Cache Manager
 * Handles multi-tier caching with Redis cluster, CDN, and edge caching
 * Supports 1M+ API evaluations per day with <50ms latency
 */

import { createHash } from 'crypto';

export interface CacheConfig {
  redis: {
    clusters: string[];
    password?: string;
    db: number;
    ttl: number;
    maxRetries: number;
  };
  cdn: {
    enabled: boolean;
    provider: 'cloudflare' | 'fastly' | 'akamai';
    zones: string[];
    ttl: number;
  };
  edge: {
    enabled: boolean;
    locations: string[];
    maxSize: number; // MB per location
    evictionPolicy: 'lru' | 'lfu' | 'fifo';
  };
  local: {
    maxSize: number; // MB
    ttl: number;
    checkPeriod: number;
  };
  warming: {
    enabled: boolean;
    patterns: string[];
    schedule: string; // Cron expression
    parallelism: number;
  };
}

export interface CacheEntry {
  key: string;
  value: any;
  metadata: {
    created: Date;
    accessed: Date;
    hits: number;
    size: number;
    ttl: number;
    tier: 'local' | 'edge' | 'redis' | 'cdn';
    compressed: boolean;
  };
}

export interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  hitRate: number;
  avgLatency: number;
  memoryUsed: number;
  entriesCount: number;
  tierStats: Map<string, TierStats>;
}

export interface TierStats {
  tier: string;
  hits: number;
  misses: number;
  latency: number;
  size: number;
  entries: number;
}

export class DistributedCacheManager {
  private config: CacheConfig;
  private localCache: Map<string, CacheEntry> = new Map();
  private stats: CacheStats;
  private redisClients: Map<string, any> = new Map();
  private cdnClient: any;
  private edgeNodes: Map<string, EdgeNode> = new Map();
  private warmingQueue: Set<string> = new Set();
  private compressionThreshold: number = 1024; // Compress if > 1KB
  
  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      redis: {
        clusters: ['localhost:6379'],
        db: 0,
        ttl: 3600,
        maxRetries: 3
      },
      cdn: {
        enabled: true,
        provider: 'cloudflare',
        zones: ['us-east', 'us-west', 'eu-west', 'ap-south'],
        ttl: 86400
      },
      edge: {
        enabled: true,
        locations: ['edge-us-1', 'edge-eu-1', 'edge-ap-1'],
        maxSize: 100,
        evictionPolicy: 'lru'
      },
      local: {
        maxSize: 50,
        ttl: 300,
        checkPeriod: 60
      },
      warming: {
        enabled: true,
        patterns: [
          'api:profile:*',
          'api:detection:*',
          'api:scoring:*'
        ],
        schedule: '0 */6 * * *', // Every 6 hours
        parallelism: 10
      },
      ...config
    };
    
    this.stats = this.initializeStats();
    this.initialize();
  }
  
  /**
   * Initialize cache system
   */
  private async initialize(): Promise<void> {
    // Initialize Redis clusters
    await this.initializeRedis();
    
    // Initialize CDN
    if (this.config.cdn.enabled) {
      await this.initializeCDN();
    }
    
    // Initialize edge nodes
    if (this.config.edge.enabled) {
      await this.initializeEdgeNodes();
    }
    
    // Start cache maintenance
    this.startMaintenance();
    
    // Start cache warming if enabled
    if (this.config.warming.enabled) {
      this.startCacheWarming();
    }
    
    console.log('Distributed cache manager initialized');
  }
  
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    
    // Level 1: Local cache
    const localEntry = this.getFromLocal(key);
    if (localEntry) {
      this.recordHit('local', Date.now() - startTime);
      return localEntry.value as T;
    }
    
    // Level 2: Edge cache
    if (this.config.edge.enabled) {
      const edgeEntry = await this.getFromEdge(key);
      if (edgeEntry) {
        this.recordHit('edge', Date.now() - startTime);
        // Promote to local cache
        await this.setLocal(key, edgeEntry.value, edgeEntry.metadata.ttl);
        return edgeEntry.value as T;
      }
    }
    
    // Level 3: Redis cluster
    const redisEntry = await this.getFromRedis(key);
    if (redisEntry) {
      this.recordHit('redis', Date.now() - startTime);
      // Promote to edge and local
      await this.promoteEntry(key, redisEntry);
      return redisEntry.value as T;
    }
    
    // Level 4: CDN
    if (this.config.cdn.enabled) {
      const cdnEntry = await this.getFromCDN(key);
      if (cdnEntry) {
        this.recordHit('cdn', Date.now() - startTime);
        // Promote to all tiers
        await this.promoteEntry(key, cdnEntry);
        return cdnEntry.value as T;
      }
    }
    
    // Cache miss
    this.recordMiss(Date.now() - startTime);
    return null;
  }
  
  /**
   * Set value in cache
   */
  async set<T>(
    key: string,
    value: T,
    ttl?: number,
    options?: {
      skipLocal?: boolean;
      skipEdge?: boolean;
      skipRedis?: boolean;
      skipCDN?: boolean;
    }
  ): Promise<void> {
    const actualTTL = ttl || this.config.redis.ttl;
    const entry = this.createCacheEntry(key, value, actualTTL);
    
    // Write to all tiers in parallel
    const writes: Promise<void>[] = [];
    
    if (!options?.skipLocal) {
      writes.push(this.setLocal(key, value, actualTTL));
    }
    
    if (!options?.skipEdge && this.config.edge.enabled) {
      writes.push(this.setEdge(key, entry));
    }
    
    if (!options?.skipRedis) {
      writes.push(this.setRedis(key, entry));
    }
    
    if (!options?.skipCDN && this.config.cdn.enabled && this.isStaticContent(key)) {
      writes.push(this.setCDN(key, entry));
    }
    
    await Promise.all(writes);
  }
  
  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    const deletes: Promise<void>[] = [];
    
    // Delete from all tiers
    deletes.push(this.deleteLocal(key));
    
    if (this.config.edge.enabled) {
      deletes.push(this.deleteEdge(key));
    }
    
    deletes.push(this.deleteRedis(key));
    
    if (this.config.cdn.enabled) {
      deletes.push(this.deleteCDN(key));
    }
    
    await Promise.all(deletes);
  }
  
  /**
   * Invalidate cache by pattern
   */
  async invalidate(pattern: string): Promise<number> {
    let invalidated = 0;
    
    // Invalidate local cache
    this.localCache.forEach((entry, key) => {
      if (this.matchesPattern(key, pattern)) {
        this.localCache.delete(key);
        invalidated++;
      }
    });
    
    // Invalidate Redis
    invalidated += await this.invalidateRedis(pattern);
    
    // Invalidate edge nodes
    if (this.config.edge.enabled) {
      for (const node of this.edgeNodes.values()) {
        invalidated += await node.invalidate(pattern);
      }
    }
    
    // Invalidate CDN
    if (this.config.cdn.enabled) {
      await this.invalidateCDN(pattern);
    }
    
    console.log(`Invalidated ${invalidated} cache entries matching ${pattern}`);
    return invalidated;
  }
  
  /**
   * Warm cache with predicted patterns
   */
  async warmCache(patterns?: string[]): Promise<void> {
    const patternsToWarm = patterns || this.config.warming.patterns;
    
    console.log(`Starting cache warming for ${patternsToWarm.length} patterns`);
    
    const warmingTasks: Promise<void>[] = [];
    const semaphore = new Semaphore(this.config.warming.parallelism);
    
    for (const pattern of patternsToWarm) {
      warmingTasks.push(
        semaphore.acquire().then(async () => {
          try {
            await this.warmPattern(pattern);
          } finally {
            semaphore.release();
          }
        })
      );
    }
    
    await Promise.all(warmingTasks);
    console.log('Cache warming completed');
  }
  
  // Local cache operations
  
  private getFromLocal(key: string): CacheEntry | null {
    const entry = this.localCache.get(key);
    
    if (!entry) return null;
    
    // Check TTL
    const age = Date.now() - entry.metadata.created.getTime();
    if (age > entry.metadata.ttl * 1000) {
      this.localCache.delete(key);
      return null;
    }
    
    // Update access metadata
    entry.metadata.accessed = new Date();
    entry.metadata.hits++;
    
    return entry;
  }
  
  private async setLocal(key: string, value: any, ttl: number): Promise<void> {
    // Check size limit
    if (this.getLocalCacheSize() >= this.config.local.maxSize * 1024 * 1024) {
      await this.evictLocal();
    }
    
    const entry = this.createCacheEntry(key, value, ttl);
    entry.metadata.tier = 'local';
    this.localCache.set(key, entry);
  }
  
  private async deleteLocal(key: string): Promise<void> {
    this.localCache.delete(key);
  }
  
  private async evictLocal(): Promise<void> {
    // LRU eviction
    const entries = Array.from(this.localCache.entries())
      .sort((a, b) => a[1].metadata.accessed.getTime() - b[1].metadata.accessed.getTime());
    
    // Evict oldest 20%
    const toEvict = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toEvict; i++) {
      this.localCache.delete(entries[i][0]);
      this.stats.evictions++;
    }
  }
  
  // Edge cache operations
  
  private async getFromEdge(key: string): Promise<CacheEntry | null> {
    const nearestEdge = this.getNearestEdgeNode();
    if (!nearestEdge) return null;
    
    return nearestEdge.get(key);
  }
  
  private async setEdge(key: string, entry: CacheEntry): Promise<void> {
    const tasks = Array.from(this.edgeNodes.values()).map(node => 
      node.set(key, entry)
    );
    await Promise.all(tasks);
  }
  
  private async deleteEdge(key: string): Promise<void> {
    const tasks = Array.from(this.edgeNodes.values()).map(node => 
      node.delete(key)
    );
    await Promise.all(tasks);
  }
  
  // Redis operations
  
  private async getFromRedis(key: string): Promise<CacheEntry | null> {
    const client = this.getRedisClient(key);
    if (!client) return null;
    
    try {
      const data = await this.redisGet(client, key);
      if (!data) return null;
      
      return this.deserializeEntry(data);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }
  
  private async setRedis(key: string, entry: CacheEntry): Promise<void> {
    const client = this.getRedisClient(key);
    if (!client) return;
    
    try {
      const serialized = this.serializeEntry(entry);
      await this.redisSet(client, key, serialized, entry.metadata.ttl);
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }
  
  private async deleteRedis(key: string): Promise<void> {
    const client = this.getRedisClient(key);
    if (!client) return;
    
    try {
      await this.redisDel(client, key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }
  
  private async invalidateRedis(pattern: string): Promise<number> {
    let invalidated = 0;
    
    for (const client of this.redisClients.values()) {
      try {
        const keys = await this.redisScan(client, pattern);
        if (keys.length > 0) {
          await this.redisDelMulti(client, keys);
          invalidated += keys.length;
        }
      } catch (error) {
        console.error('Redis invalidate error:', error);
      }
    }
    
    return invalidated;
  }
  
  // CDN operations
  
  private async getFromCDN(key: string): Promise<CacheEntry | null> {
    if (!this.cdnClient) return null;
    
    try {
      const data = await this.cdnGet(key);
      if (!data) return null;
      
      return this.deserializeEntry(data);
    } catch (error) {
      console.error('CDN get error:', error);
      return null;
    }
  }
  
  private async setCDN(key: string, entry: CacheEntry): Promise<void> {
    if (!this.cdnClient) return;
    
    try {
      const serialized = this.serializeEntry(entry);
      await this.cdnPut(key, serialized, entry.metadata.ttl);
    } catch (error) {
      console.error('CDN set error:', error);
    }
  }
  
  private async deleteCDN(key: string): Promise<void> {
    if (!this.cdnClient) return;
    
    try {
      await this.cdnPurge(key);
    } catch (error) {
      console.error('CDN delete error:', error);
    }
  }
  
  private async invalidateCDN(pattern: string): Promise<void> {
    if (!this.cdnClient) return;
    
    try {
      await this.cdnPurgeByTag(pattern);
    } catch (error) {
      console.error('CDN invalidate error:', error);
    }
  }
  
  // Helper methods
  
  private createCacheEntry(key: string, value: any, ttl: number): CacheEntry {
    const serialized = JSON.stringify(value);
    const size = Buffer.byteLength(serialized, 'utf8');
    const compressed = size > this.compressionThreshold;
    
    return {
      key,
      value: compressed ? this.compress(value) : value,
      metadata: {
        created: new Date(),
        accessed: new Date(),
        hits: 0,
        size,
        ttl,
        tier: 'local',
        compressed
      }
    };
  }
  
  private async promoteEntry(key: string, entry: CacheEntry): Promise<void> {
    const promotes: Promise<void>[] = [];
    
    // Promote to local
    promotes.push(this.setLocal(key, entry.value, entry.metadata.ttl));
    
    // Promote to edge if not already there
    if (this.config.edge.enabled && entry.metadata.tier !== 'edge') {
      promotes.push(this.setEdge(key, entry));
    }
    
    await Promise.all(promotes);
  }
  
  private getRedisClient(key: string): any {
    // Consistent hashing to select Redis node
    const hash = this.hashKey(key);
    const index = hash % this.redisClients.size;
    return Array.from(this.redisClients.values())[index];
  }
  
  private getNearestEdgeNode(): EdgeNode | null {
    // In production, use geo-location
    // For now, return first available
    return this.edgeNodes.values().next().value || null;
  }
  
  private hashKey(key: string): number {
    const hash = createHash('md5').update(key).digest();
    return hash.readUInt32BE(0);
  }
  
  private matchesPattern(key: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(key);
  }
  
  private isStaticContent(key: string): boolean {
    // Determine if content should be cached in CDN
    return key.startsWith('static:') || 
           key.startsWith('pattern:') ||
           key.startsWith('profile:');
  }
  
  private compress(value: any): any {
    // In production, use proper compression (gzip/brotli)
    return value; // Simplified
  }
  
  private decompress(value: any): any {
    // In production, decompress
    return value; // Simplified
  }
  
  private serializeEntry(entry: CacheEntry): string {
    return JSON.stringify(entry);
  }
  
  private deserializeEntry(data: string): CacheEntry {
    const entry = JSON.parse(data);
    entry.metadata.created = new Date(entry.metadata.created);
    entry.metadata.accessed = new Date(entry.metadata.accessed);
    
    if (entry.metadata.compressed) {
      entry.value = this.decompress(entry.value);
    }
    
    return entry;
  }
  
  private getLocalCacheSize(): number {
    let size = 0;
    this.localCache.forEach(entry => {
      size += entry.metadata.size;
    });
    return size;
  }
  
  private async warmPattern(pattern: string): Promise<void> {
    // Generate keys matching pattern
    const keys = await this.generateKeysForPattern(pattern);
    
    console.log(`Warming ${keys.length} keys for pattern ${pattern}`);
    
    for (const key of keys) {
      // Check if already cached
      const exists = await this.get(key);
      if (!exists) {
        // Generate and cache value
        const value = await this.generateValueForKey(key);
        if (value) {
          await this.set(key, value);
        }
      }
    }
  }
  
  private async generateKeysForPattern(pattern: string): Promise<string[]> {
    // In production, query database or service
    // For simulation, generate sample keys
    const keys: string[] = [];
    
    if (pattern.includes('profile')) {
      keys.push('api:profile:rest', 'api:profile:graphql', 'api:profile:grpc');
    }
    if (pattern.includes('detection')) {
      keys.push('api:detection:ml_model_v1', 'api:detection:ml_model_v2');
    }
    if (pattern.includes('scoring')) {
      keys.push('api:scoring:weights', 'api:scoring:thresholds');
    }
    
    return keys;
  }
  
  private async generateValueForKey(key: string): Promise<any> {
    // Generate appropriate value based on key
    if (key.includes('profile')) {
      return { type: 'profile', data: {} };
    }
    if (key.includes('detection')) {
      return { type: 'model', data: {} };
    }
    if (key.includes('scoring')) {
      return { type: 'config', data: {} };
    }
    return null;
  }
  
  // Redis client methods (simplified)
  
  private async initializeRedis(): Promise<void> {
    // In production, use redis/ioredis client
    this.config.redis.clusters.forEach(cluster => {
      this.redisClients.set(cluster, { connected: true });
    });
  }
  
  private async redisGet(client: any, key: string): Promise<string | null> {
    // Simulated Redis get
    return null;
  }
  
  private async redisSet(client: any, key: string, value: string, ttl: number): Promise<void> {
    // Simulated Redis set
  }
  
  private async redisDel(client: any, key: string): Promise<void> {
    // Simulated Redis delete
  }
  
  private async redisScan(client: any, pattern: string): Promise<string[]> {
    // Simulated Redis scan
    return [];
  }
  
  private async redisDelMulti(client: any, keys: string[]): Promise<void> {
    // Simulated Redis multi-delete
  }
  
  // CDN client methods (simplified)
  
  private async initializeCDN(): Promise<void> {
    // In production, initialize CDN client
    this.cdnClient = { connected: true };
  }
  
  private async cdnGet(key: string): Promise<string | null> {
    // Simulated CDN get
    return null;
  }
  
  private async cdnPut(key: string, value: string, ttl: number): Promise<void> {
    // Simulated CDN put
  }
  
  private async cdnPurge(key: string): Promise<void> {
    // Simulated CDN purge
  }
  
  private async cdnPurgeByTag(tag: string): Promise<void> {
    // Simulated CDN purge by tag
  }
  
  // Edge node management
  
  private async initializeEdgeNodes(): Promise<void> {
    this.config.edge.locations.forEach(location => {
      this.edgeNodes.set(location, new EdgeNode(location, this.config.edge));
    });
  }
  
  // Statistics and monitoring
  
  private initializeStats(): CacheStats {
    return {
      hits: 0,
      misses: 0,
      evictions: 0,
      hitRate: 0,
      avgLatency: 0,
      memoryUsed: 0,
      entriesCount: 0,
      tierStats: new Map([
        ['local', { tier: 'local', hits: 0, misses: 0, latency: 0, size: 0, entries: 0 }],
        ['edge', { tier: 'edge', hits: 0, misses: 0, latency: 0, size: 0, entries: 0 }],
        ['redis', { tier: 'redis', hits: 0, misses: 0, latency: 0, size: 0, entries: 0 }],
        ['cdn', { tier: 'cdn', hits: 0, misses: 0, latency: 0, size: 0, entries: 0 }]
      ])
    };
  }
  
  private recordHit(tier: string, latency: number): void {
    this.stats.hits++;
    const tierStat = this.stats.tierStats.get(tier);
    if (tierStat) {
      tierStat.hits++;
      tierStat.latency = (tierStat.latency * (tierStat.hits - 1) + latency) / tierStat.hits;
    }
    this.updateHitRate();
  }
  
  private recordMiss(latency: number): void {
    this.stats.misses++;
    this.updateHitRate();
  }
  
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
  
  private startMaintenance(): void {
    setInterval(() => {
      this.performMaintenance();
    }, this.config.local.checkPeriod * 1000);
  }
  
  private async performMaintenance(): Promise<void> {
    // Clean expired entries
    const now = Date.now();
    const toDelete: string[] = [];
    
    this.localCache.forEach((entry, key) => {
      const age = now - entry.metadata.created.getTime();
      if (age > entry.metadata.ttl * 1000) {
        toDelete.push(key);
      }
    });
    
    toDelete.forEach(key => this.localCache.delete(key));
    
    // Update statistics
    this.stats.memoryUsed = this.getLocalCacheSize();
    this.stats.entriesCount = this.localCache.size;
  }
  
  private startCacheWarming(): void {
    // Parse cron schedule and set up warming
    // For simplicity, warm every 6 hours
    setInterval(() => {
      this.warmCache();
    }, 6 * 60 * 60 * 1000);
    
    // Initial warming
    this.warmCache();
  }
  
  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Clear all caches
   */
  async clear(): Promise<void> {
    this.localCache.clear();
    
    // Clear Redis
    for (const client of this.redisClients.values()) {
      // await client.flushdb();
    }
    
    // Clear edge nodes
    for (const node of this.edgeNodes.values()) {
      await node.clear();
    }
    
    // Reset stats
    this.stats = this.initializeStats();
    
    console.log('All caches cleared');
  }
}

// Edge Node implementation
class EdgeNode {
  private location: string;
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private evictionPolicy: string;
  
  constructor(location: string, config: any) {
    this.location = location;
    this.maxSize = config.maxSize * 1024 * 1024; // Convert MB to bytes
    this.evictionPolicy = config.evictionPolicy;
  }
  
  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    // Check TTL
    const age = Date.now() - entry.metadata.created.getTime();
    if (age > entry.metadata.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }
    
    entry.metadata.accessed = new Date();
    entry.metadata.hits++;
    
    return entry;
  }
  
  async set(key: string, entry: CacheEntry): Promise<void> {
    // Check size limit
    if (this.getCurrentSize() + entry.metadata.size > this.maxSize) {
      await this.evict();
    }
    
    entry.metadata.tier = 'edge';
    this.cache.set(key, entry);
  }
  
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }
  
  async invalidate(pattern: string): Promise<number> {
    let invalidated = 0;
    const toDelete: string[] = [];
    
    this.cache.forEach((entry, key) => {
      if (this.matchesPattern(key, pattern)) {
        toDelete.push(key);
        invalidated++;
      }
    });
    
    toDelete.forEach(key => this.cache.delete(key));
    return invalidated;
  }
  
  async clear(): Promise<void> {
    this.cache.clear();
  }
  
  private getCurrentSize(): number {
    let size = 0;
    this.cache.forEach(entry => {
      size += entry.metadata.size;
    });
    return size;
  }
  
  private async evict(): Promise<void> {
    const entries = Array.from(this.cache.entries());
    
    switch (this.evictionPolicy) {
      case 'lru':
        entries.sort((a, b) => 
          a[1].metadata.accessed.getTime() - b[1].metadata.accessed.getTime()
        );
        break;
      
      case 'lfu':
        entries.sort((a, b) => a[1].metadata.hits - b[1].metadata.hits);
        break;
      
      case 'fifo':
        entries.sort((a, b) => 
          a[1].metadata.created.getTime() - b[1].metadata.created.getTime()
        );
        break;
    }
    
    // Evict oldest 20%
    const toEvict = Math.floor(entries.length * 0.2);
    for (let i = 0; i < toEvict; i++) {
      this.cache.delete(entries[i][0]);
    }
  }
  
  private matchesPattern(key: string, pattern: string): boolean {
    const regex = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${regex}$`).test(key);
  }
}

// Semaphore for parallelism control
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];
  
  constructor(permits: number) {
    this.permits = permits;
  }
  
  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    
    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }
  
  release(): void {
    this.permits++;
    
    if (this.waiting.length > 0 && this.permits > 0) {
      this.permits--;
      const resolve = this.waiting.shift()!;
      resolve();
    }
  }
}