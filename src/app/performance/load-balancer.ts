/**
 * Load Balancer System
 * Intelligent request routing with health checks and auto-scaling
 * Supports multiple algorithms and geographic routing
 */

export interface LoadBalancerConfig {
  algorithm: 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash' | 'geographic';
  healthCheck: {
    enabled: boolean;
    interval: number; // ms
    timeout: number;
    unhealthyThreshold: number;
    healthyThreshold: number;
    path: string;
  };
  rateLimit: {
    enabled: boolean;
    requestsPerSecond: number;
    burstSize: number;
    keyExtractor: (request: any) => string;
  };
  circuitBreaker: {
    enabled: boolean;
    errorThreshold: number; // percentage
    volumeThreshold: number; // minimum requests
    sleepWindow: number; // ms
    bucketSize: number; // ms
  };
  autoScaling: {
    enabled: boolean;
    minInstances: number;
    maxInstances: number;
    targetCPU: number; // percentage
    targetMemory: number; // percentage
    scaleUpThreshold: number;
    scaleDownThreshold: number;
    cooldownPeriod: number; // seconds
  };
  geographic: {
    enabled: boolean;
    regions: Map<string, string[]>; // region -> endpoints
    defaultRegion: string;
  };
}

export interface Backend {
  id: string;
  url: string;
  weight: number;
  region?: string;
  status: 'healthy' | 'unhealthy' | 'draining' | 'offline';
  connections: number;
  requestCount: number;
  errorCount: number;
  avgResponseTime: number;
  lastHealthCheck?: Date;
  metadata: {
    cpu: number;
    memory: number;
    diskIO: number;
    networkIO: number;
  };
}

export interface Request {
  id: string;
  method: string;
  path: string;
  headers: Map<string, string>;
  body?: any;
  clientIP: string;
  timestamp: Date;
  priority: 'low' | 'normal' | 'high';
}

export interface Response {
  statusCode: number;
  headers: Map<string, string>;
  body: any;
  backendId: string;
  latency: number;
}

export interface LoadBalancerMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatency: number;
  p50Latency: number;
  p95Latency: number;
  p99Latency: number;
  requestsPerSecond: number;
  activeConnections: number;
  backendHealth: Map<string, boolean>;
  circuitBreakerStatus: Map<string, 'closed' | 'open' | 'half-open'>;
}

export class LoadBalancer {
  private config: LoadBalancerConfig;
  private backends: Map<string, Backend> = new Map();
  private healthCheckTimers: Map<string, NodeJS.Timeout> = new Map();
  private rateLimitBuckets: Map<string, TokenBucket> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private metrics: LoadBalancerMetrics;
  private requestQueue: Request[] = [];
  private roundRobinIndex: number = 0;
  private ipHashCache: Map<string, string> = new Map();
  private geoIPService: GeoIPService;
  private autoScaler?: AutoScaler;
  
  constructor(config?: Partial<LoadBalancerConfig>) {
    this.config = {
      algorithm: 'weighted',
      healthCheck: {
        enabled: true,
        interval: 5000,
        timeout: 3000,
        unhealthyThreshold: 3,
        healthyThreshold: 2,
        path: '/health'
      },
      rateLimit: {
        enabled: true,
        requestsPerSecond: 1000,
        burstSize: 100,
        keyExtractor: (req) => req.clientIP
      },
      circuitBreaker: {
        enabled: true,
        errorThreshold: 50,
        volumeThreshold: 20,
        sleepWindow: 30000,
        bucketSize: 10000
      },
      autoScaling: {
        enabled: true,
        minInstances: 2,
        maxInstances: 10,
        targetCPU: 70,
        targetMemory: 80,
        scaleUpThreshold: 80,
        scaleDownThreshold: 20,
        cooldownPeriod: 300
      },
      geographic: {
        enabled: false,
        regions: new Map(),
        defaultRegion: 'us-east'
      },
      ...config
    };
    
    this.metrics = this.initializeMetrics();
    this.geoIPService = new GeoIPService();
    
    if (this.config.autoScaling.enabled) {
      this.autoScaler = new AutoScaler(this.config.autoScaling);
    }
    
    this.initialize();
  }
  
  /**
   * Initialize load balancer
   */
  private async initialize(): Promise<void> {
    // Start health checks
    if (this.config.healthCheck.enabled) {
      this.startHealthChecks();
    }
    
    // Start metrics collection
    this.startMetricsCollection();
    
    // Start auto-scaling
    if (this.autoScaler) {
      this.autoScaler.start(this);
    }
    
    console.log('Load balancer initialized');
  }
  
  /**
   * Add backend server
   */
  async addBackend(
    id: string,
    url: string,
    weight: number = 1,
    region?: string
  ): Promise<void> {
    const backend: Backend = {
      id,
      url,
      weight,
      region,
      status: 'healthy',
      connections: 0,
      requestCount: 0,
      errorCount: 0,
      avgResponseTime: 0,
      metadata: {
        cpu: 0,
        memory: 0,
        diskIO: 0,
        networkIO: 0
      }
    };
    
    this.backends.set(id, backend);
    
    // Initialize circuit breaker
    if (this.config.circuitBreaker.enabled) {
      this.circuitBreakers.set(
        id,
        new CircuitBreaker(this.config.circuitBreaker)
      );
    }
    
    // Start health check
    if (this.config.healthCheck.enabled) {
      this.startHealthCheckForBackend(backend);
    }
    
    console.log(`Added backend ${id} at ${url}`);
  }
  
  /**
   * Remove backend server
   */
  async removeBackend(id: string, graceful: boolean = true): Promise<void> {
    const backend = this.backends.get(id);
    if (!backend) return;
    
    if (graceful) {
      // Drain connections
      backend.status = 'draining';
      await this.drainBackend(backend);
    }
    
    // Stop health check
    const timer = this.healthCheckTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.healthCheckTimers.delete(id);
    }
    
    // Remove backend
    this.backends.delete(id);
    this.circuitBreakers.delete(id);
    
    console.log(`Removed backend ${id}`);
  }
  
  /**
   * Route request to backend
   */
  async route(request: Request): Promise<Response> {
    const startTime = Date.now();
    
    // Rate limiting
    if (this.config.rateLimit.enabled) {
      const allowed = await this.checkRateLimit(request);
      if (!allowed) {
        return this.createErrorResponse(429, 'Rate limit exceeded');
      }
    }
    
    // Select backend
    const backend = await this.selectBackend(request);
    if (!backend) {
      return this.createErrorResponse(503, 'No healthy backends available');
    }
    
    // Check circuit breaker
    if (this.config.circuitBreaker.enabled) {
      const breaker = this.circuitBreakers.get(backend.id);
      if (breaker && !breaker.allowRequest()) {
        // Try another backend
        const fallback = await this.selectBackend(request, backend.id);
        if (fallback) {
          return this.route({ ...request, id: `${request.id}_retry` });
        }
        return this.createErrorResponse(503, 'Circuit breaker open');
      }
    }
    
    // Forward request
    try {
      backend.connections++;
      backend.requestCount++;
      
      const response = await this.forwardRequest(request, backend);
      
      // Update metrics
      const latency = Date.now() - startTime;
      this.updateMetrics(backend, latency, response.statusCode);
      
      // Update circuit breaker
      if (this.config.circuitBreaker.enabled) {
        const breaker = this.circuitBreakers.get(backend.id);
        if (breaker) {
          if (response.statusCode >= 500) {
            breaker.recordFailure();
          } else {
            breaker.recordSuccess();
          }
        }
      }
      
      return {
        ...response,
        backendId: backend.id,
        latency
      };
      
    } catch (error) {
      backend.errorCount++;
      
      // Record circuit breaker failure
      if (this.config.circuitBreaker.enabled) {
        const breaker = this.circuitBreakers.get(backend.id);
        breaker?.recordFailure();
      }
      
      // Try failover
      const fallback = await this.selectBackend(request, backend.id);
      if (fallback) {
        return this.route({ ...request, id: `${request.id}_failover` });
      }
      
      throw error;
    } finally {
      backend.connections--;
    }
  }
  
  /**
   * Select backend based on algorithm
   */
  private async selectBackend(
    request: Request,
    excludeId?: string
  ): Promise<Backend | null> {
    const healthyBackends = Array.from(this.backends.values())
      .filter(b => 
        b.status === 'healthy' && 
        b.id !== excludeId
      );
    
    if (healthyBackends.length === 0) {
      return null;
    }
    
    switch (this.config.algorithm) {
      case 'round-robin':
        return this.selectRoundRobin(healthyBackends);
      
      case 'least-connections':
        return this.selectLeastConnections(healthyBackends);
      
      case 'weighted':
        return this.selectWeighted(healthyBackends);
      
      case 'ip-hash':
        return this.selectIPHash(healthyBackends, request.clientIP);
      
      case 'geographic':
        return this.selectGeographic(healthyBackends, request);
      
      default:
        return healthyBackends[0];
    }
  }
  
  /**
   * Round-robin selection
   */
  private selectRoundRobin(backends: Backend[]): Backend {
    const backend = backends[this.roundRobinIndex % backends.length];
    this.roundRobinIndex++;
    return backend;
  }
  
  /**
   * Least connections selection
   */
  private selectLeastConnections(backends: Backend[]): Backend {
    return backends.reduce((min, backend) => 
      backend.connections < min.connections ? backend : min
    );
  }
  
  /**
   * Weighted selection
   */
  private selectWeighted(backends: Backend[]): Backend {
    const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const backend of backends) {
      random -= backend.weight;
      if (random <= 0) {
        return backend;
      }
    }
    
    return backends[backends.length - 1];
  }
  
  /**
   * IP hash selection
   */
  private selectIPHash(backends: Backend[], clientIP: string): Backend {
    // Check cache
    const cached = this.ipHashCache.get(clientIP);
    if (cached) {
      const backend = this.backends.get(cached);
      if (backend && backend.status === 'healthy') {
        return backend;
      }
    }
    
    // Calculate hash
    let hash = 0;
    for (let i = 0; i < clientIP.length; i++) {
      hash = ((hash << 5) - hash) + clientIP.charCodeAt(i);
      hash = hash & hash;
    }
    
    const index = Math.abs(hash) % backends.length;
    const backend = backends[index];
    
    // Cache result
    this.ipHashCache.set(clientIP, backend.id);
    
    // Limit cache size
    if (this.ipHashCache.size > 10000) {
      const firstKey = this.ipHashCache.keys().next().value;
      this.ipHashCache.delete(firstKey);
    }
    
    return backend;
  }
  
  /**
   * Geographic selection
   */
  private async selectGeographic(
    backends: Backend[],
    request: Request
  ): Promise<Backend> {
    const clientRegion = await this.geoIPService.getRegion(request.clientIP);
    
    // Filter by region
    const regionalBackends = backends.filter(b => b.region === clientRegion);
    
    if (regionalBackends.length > 0) {
      // Use weighted selection within region
      return this.selectWeighted(regionalBackends);
    }
    
    // Fallback to default region or any backend
    const defaultBackends = backends.filter(
      b => b.region === this.config.geographic.defaultRegion
    );
    
    return defaultBackends.length > 0 ?
      this.selectWeighted(defaultBackends) :
      this.selectWeighted(backends);
  }
  
  /**
   * Forward request to backend
   */
  private async forwardRequest(
    request: Request,
    backend: Backend
  ): Promise<Response> {
    // Simulate request forwarding
    // In production, use actual HTTP client
    
    const latency = Math.random() * 100 + 20; // 20-120ms
    await new Promise(resolve => setTimeout(resolve, latency));
    
    // Simulate response
    const statusCode = Math.random() > 0.95 ? 500 : 200;
    
    return {
      statusCode,
      headers: new Map([['X-Backend-Id', backend.id]]),
      body: { message: 'Response from backend' },
      backendId: backend.id,
      latency
    };
  }
  
  /**
   * Health check for backend
   */
  private async healthCheck(backend: Backend): Promise<boolean> {
    try {
      // Simulate health check
      const healthy = Math.random() > 0.1; // 90% healthy
      
      if (healthy) {
        // Collect metrics
        backend.metadata.cpu = Math.random() * 100;
        backend.metadata.memory = Math.random() * 100;
        backend.metadata.diskIO = Math.random() * 100;
        backend.metadata.networkIO = Math.random() * 100;
      }
      
      return healthy;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.backends.forEach(backend => {
      this.startHealthCheckForBackend(backend);
    });
  }
  
  /**
   * Start health check for specific backend
   */
  private startHealthCheckForBackend(backend: Backend): void {
    const timer = setInterval(async () => {
      const wasHealthy = backend.status === 'healthy';
      const isHealthy = await this.healthCheck(backend);
      
      backend.lastHealthCheck = new Date();
      
      if (isHealthy) {
        if (backend.status === 'unhealthy') {
          // Wait for consecutive healthy checks
          if (!backend.metadata.healthyCount) {
            backend.metadata.healthyCount = 0;
          }
          backend.metadata.healthyCount++;
          
          if (backend.metadata.healthyCount >= this.config.healthCheck.healthyThreshold) {
            backend.status = 'healthy';
            backend.metadata.healthyCount = 0;
            console.log(`Backend ${backend.id} is now healthy`);
          }
        } else {
          backend.status = 'healthy';
        }
      } else {
        if (backend.status === 'healthy') {
          // Wait for consecutive unhealthy checks
          if (!backend.metadata.unhealthyCount) {
            backend.metadata.unhealthyCount = 0;
          }
          backend.metadata.unhealthyCount++;
          
          if (backend.metadata.unhealthyCount >= this.config.healthCheck.unhealthyThreshold) {
            backend.status = 'unhealthy';
            backend.metadata.unhealthyCount = 0;
            console.log(`Backend ${backend.id} is now unhealthy`);
          }
        } else {
          backend.status = 'unhealthy';
        }
      }
      
      // Update metrics
      this.metrics.backendHealth.set(backend.id, backend.status === 'healthy');
      
    }, this.config.healthCheck.interval);
    
    this.healthCheckTimers.set(backend.id, timer);
  }
  
  /**
   * Drain backend connections
   */
  private async drainBackend(backend: Backend): Promise<void> {
    console.log(`Draining backend ${backend.id}`);
    
    // Wait for active connections to complete
    while (backend.connections > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    backend.status = 'offline';
  }
  
  /**
   * Check rate limit
   */
  private async checkRateLimit(request: Request): Promise<boolean> {
    const key = this.config.rateLimit.keyExtractor(request);
    
    let bucket = this.rateLimitBuckets.get(key);
    if (!bucket) {
      bucket = new TokenBucket(
        this.config.rateLimit.requestsPerSecond,
        this.config.rateLimit.burstSize
      );
      this.rateLimitBuckets.set(key, bucket);
    }
    
    return bucket.tryConsume(1);
  }
  
  /**
   * Create error response
   */
  private createErrorResponse(statusCode: number, message: string): Response {
    return {
      statusCode,
      headers: new Map([['Content-Type', 'application/json']]),
      body: { error: message },
      backendId: 'none',
      latency: 0
    };
  }
  
  /**
   * Update metrics
   */
  private updateMetrics(
    backend: Backend,
    latency: number,
    statusCode: number
  ): void {
    // Update backend metrics
    backend.avgResponseTime = 
      (backend.avgResponseTime * (backend.requestCount - 1) + latency) /
      backend.requestCount;
    
    // Update global metrics
    this.metrics.totalRequests++;
    
    if (statusCode < 500) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }
    
    // Update latency metrics
    this.metrics.avgLatency = 
      (this.metrics.avgLatency * (this.metrics.totalRequests - 1) + latency) /
      this.metrics.totalRequests;
  }
  
  /**
   * Initialize metrics
   */
  private initializeMetrics(): LoadBalancerMetrics {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      avgLatency: 0,
      p50Latency: 0,
      p95Latency: 0,
      p99Latency: 0,
      requestsPerSecond: 0,
      activeConnections: 0,
      backendHealth: new Map(),
      circuitBreakerStatus: new Map()
    };
  }
  
  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      // Calculate requests per second
      // This is simplified - in production, use sliding window
      this.metrics.requestsPerSecond = this.metrics.totalRequests / 60;
      
      // Calculate active connections
      this.metrics.activeConnections = Array.from(this.backends.values())
        .reduce((sum, b) => sum + b.connections, 0);
      
      // Update circuit breaker status
      this.circuitBreakers.forEach((breaker, id) => {
        this.metrics.circuitBreakerStatus.set(id, breaker.getState());
      });
    }, 1000);
  }
  
  /**
   * Get metrics
   */
  getMetrics(): LoadBalancerMetrics {
    return { ...this.metrics };
  }
  
  /**
   * Get backend status
   */
  getBackends(): Backend[] {
    return Array.from(this.backends.values());
  }
}

// Helper classes

class TokenBucket {
  private capacity: number;
  private tokens: number;
  private refillRate: number;
  private lastRefill: number;
  
  constructor(refillRate: number, capacity: number) {
    this.refillRate = refillRate;
    this.capacity = capacity;
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }
  
  tryConsume(count: number): boolean {
    this.refill();
    
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    
    return false;
  }
  
  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    
    this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }
}

class CircuitBreaker {
  private config: any;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastFailureTime?: Date;
  private requestCount: number = 0;
  private bucketStart: number = Date.now();
  
  constructor(config: any) {
    this.config = config;
  }
  
  allowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      // Check if sleep window has passed
      if (this.lastFailureTime) {
        const elapsed = Date.now() - this.lastFailureTime.getTime();
        if (elapsed > this.config.sleepWindow) {
          this.state = 'half-open';
          return true;
        }
      }
      return false;
    }
    
    // Half-open: allow limited requests
    return true;
  }
  
  recordSuccess(): void {
    this.requestCount++;
    
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.config.healthyThreshold) {
        this.close();
      }
    }
    
    this.checkBucket();
  }
  
  recordFailure(): void {
    this.requestCount++;
    this.failureCount++;
    this.lastFailureTime = new Date();
    
    if (this.state === 'half-open') {
      this.open();
    } else if (this.state === 'closed') {
      // Check if we should open
      const errorRate = (this.failureCount / this.requestCount) * 100;
      
      if (this.requestCount >= this.config.volumeThreshold &&
          errorRate >= this.config.errorThreshold) {
        this.open();
      }
    }
    
    this.checkBucket();
  }
  
  private open(): void {
    this.state = 'open';
    this.failureCount = 0;
    this.successCount = 0;
    console.log('Circuit breaker opened');
  }
  
  private close(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    console.log('Circuit breaker closed');
  }
  
  private checkBucket(): void {
    const now = Date.now();
    if (now - this.bucketStart > this.config.bucketSize) {
      // Reset bucket
      this.requestCount = 0;
      this.failureCount = 0;
      this.bucketStart = now;
    }
  }
  
  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }
}

class GeoIPService {
  private cache: Map<string, string> = new Map();
  
  async getRegion(ip: string): Promise<string> {
    // Check cache
    const cached = this.cache.get(ip);
    if (cached) return cached;
    
    // Simulate GeoIP lookup
    const regions = ['us-east', 'us-west', 'eu-west', 'ap-south'];
    const region = regions[Math.floor(Math.random() * regions.length)];
    
    // Cache result
    this.cache.set(ip, region);
    
    return region;
  }
}

class AutoScaler {
  private config: any;
  private lastScaleTime: Date = new Date();
  private timer?: NodeJS.Timeout;
  
  constructor(config: any) {
    this.config = config;
  }
  
  start(loadBalancer: LoadBalancer): void {
    this.timer = setInterval(async () => {
      await this.checkScaling(loadBalancer);
    }, 30000); // Check every 30 seconds
  }
  
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
  
  private async checkScaling(loadBalancer: LoadBalancer): Promise<void> {
    // Check if in cooldown period
    const elapsed = Date.now() - this.lastScaleTime.getTime();
    if (elapsed < this.config.cooldownPeriod * 1000) {
      return;
    }
    
    const backends = loadBalancer.getBackends();
    const metrics = loadBalancer.getMetrics();
    
    // Calculate average resource usage
    let avgCPU = 0;
    let avgMemory = 0;
    let healthyCount = 0;
    
    backends.forEach(backend => {
      if (backend.status === 'healthy') {
        avgCPU += backend.metadata.cpu;
        avgMemory += backend.metadata.memory;
        healthyCount++;
      }
    });
    
    if (healthyCount === 0) return;
    
    avgCPU /= healthyCount;
    avgMemory /= healthyCount;
    
    // Check if we need to scale up
    if ((avgCPU > this.config.scaleUpThreshold || 
         avgMemory > this.config.scaleUpThreshold) &&
        healthyCount < this.config.maxInstances) {
      await this.scaleUp(loadBalancer);
      this.lastScaleTime = new Date();
    }
    // Check if we need to scale down
    else if (avgCPU < this.config.scaleDownThreshold &&
             avgMemory < this.config.scaleDownThreshold &&
             healthyCount > this.config.minInstances) {
      await this.scaleDown(loadBalancer);
      this.lastScaleTime = new Date();
    }
  }
  
  private async scaleUp(loadBalancer: LoadBalancer): Promise<void> {
    console.log('Auto-scaling: Adding new instance');
    const newId = `backend-${Date.now()}`;
    await loadBalancer.addBackend(newId, `http://new-instance-${newId}`, 1);
  }
  
  private async scaleDown(loadBalancer: LoadBalancer): Promise<void> {
    console.log('Auto-scaling: Removing instance');
    const backends = loadBalancer.getBackends();
    
    // Find instance with least connections
    const target = backends
      .filter(b => b.status === 'healthy')
      .sort((a, b) => a.connections - b.connections)[0];
    
    if (target) {
      await loadBalancer.removeBackend(target.id, true);
    }
  }
}