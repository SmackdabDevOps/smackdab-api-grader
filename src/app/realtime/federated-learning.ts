/**
 * Federated Learning System
 * Enables privacy-preserving learning across multiple organizations
 * Implements secure aggregation and differential privacy
 */

import { OnlineLearner, OnlineSample } from './online-learner';

export interface FederatedConfig {
  minClients: number;
  roundTimeout: number; // seconds
  aggregationStrategy: 'average' | 'weighted' | 'secure';
  differentialPrivacy: {
    enabled: boolean;
    epsilon: number;  // Privacy budget
    delta: number;    // Failure probability
    clippingNorm: number;
  };
  encryption: {
    enabled: boolean;
    algorithm: 'homomorphic' | 'secure-multiparty' | 'none';
    keySize: number;
  };
  validation: {
    enabled: boolean;
    threshold: number; // Minimum accuracy to accept update
  };
}

export interface FederatedClient {
  id: string;
  organizationId: string;
  dataSize: number;
  modelVersion: string;
  lastUpdate: Date;
  trustScore: number;
  region: string;
  capabilities: {
    computePower: number;
    bandwidth: number;
    storage: number;
  };
}

export interface LocalUpdate {
  clientId: string;
  round: number;
  weights: Map<string, Float32Array>;
  metrics: {
    loss: number;
    accuracy: number;
    samplesUsed: number;
  };
  timestamp: Date;
  signature: string;
}

export interface GlobalModel {
  version: string;
  weights: Map<string, Float32Array>;
  round: number;
  participatingClients: string[];
  aggregatedMetrics: {
    avgLoss: number;
    avgAccuracy: number;
    totalSamples: number;
  };
  timestamp: Date;
}

export interface PrivacyMetrics {
  privacySpent: number;  // Accumulated epsilon
  noiseLevels: Map<string, number>;
  clientContributions: Map<string, number>;
  sensitivityBounds: Map<string, number>;
}

export class FederatedLearningCoordinator {
  private config: FederatedConfig;
  private clients: Map<string, FederatedClient> = new Map();
  private globalModel: GlobalModel;
  private currentRound: number = 0;
  private localUpdates: Map<number, LocalUpdate[]> = new Map();
  private privacyMetrics: PrivacyMetrics;
  private isTraining: boolean = false;
  private roundTimer?: NodeJS.Timeout;
  
  // Differential privacy state
  private privacyAccountant = {
    totalEpsilon: 0,
    totalDelta: 0,
    queryCount: 0
  };
  
  // Secure aggregation state
  private secureAggregation = {
    publicKeys: new Map<string, string>(),
    sharedSecrets: new Map<string, Map<string, string>>(),
    masks: new Map<string, Float32Array>()
  };
  
  constructor(config?: Partial<FederatedConfig>) {
    this.config = {
      minClients: 3,
      roundTimeout: 300, // 5 minutes
      aggregationStrategy: 'secure',
      differentialPrivacy: {
        enabled: true,
        epsilon: 1.0,
        delta: 1e-5,
        clippingNorm: 1.0
      },
      encryption: {
        enabled: true,
        algorithm: 'secure-multiparty',
        keySize: 2048
      },
      validation: {
        enabled: true,
        threshold: 0.5
      },
      ...config
    };
    
    this.globalModel = this.initializeGlobalModel();
    this.privacyMetrics = this.initializePrivacyMetrics();
  }
  
  /**
   * Initialize global model
   */
  private initializeGlobalModel(): GlobalModel {
    const weights = new Map<string, Float32Array>();
    
    // Initialize with random weights (same structure as OnlineLearner)
    const layerSizes = [768, 512, 256, 128, 64, 32, 5];
    
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const inputSize = layerSizes[i];
      const outputSize = layerSizes[i + 1];
      
      // Weight matrix
      const w = new Float32Array(inputSize * outputSize);
      const scale = Math.sqrt(2 / inputSize);
      for (let j = 0; j < w.length; j++) {
        w[j] = (Math.random() - 0.5) * 2 * scale;
      }
      weights.set(`layer_${i}_weights`, w);
      
      // Bias vector
      weights.set(`layer_${i}_bias`, new Float32Array(outputSize));
    }
    
    return {
      version: '1.0.0',
      weights,
      round: 0,
      participatingClients: [],
      aggregatedMetrics: {
        avgLoss: Infinity,
        avgAccuracy: 0,
        totalSamples: 0
      },
      timestamp: new Date()
    };
  }
  
  /**
   * Initialize privacy metrics
   */
  private initializePrivacyMetrics(): PrivacyMetrics {
    return {
      privacySpent: 0,
      noiseLevels: new Map(),
      clientContributions: new Map(),
      sensitivityBounds: new Map()
    };
  }
  
  /**
   * Register a new client
   */
  async registerClient(client: FederatedClient): Promise<void> {
    console.log(`Registering client ${client.id} from ${client.organizationId}`);
    
    // Validate client
    if (!this.validateClient(client)) {
      throw new Error('Client validation failed');
    }
    
    // Generate keys for secure aggregation
    if (this.config.encryption.enabled) {
      await this.setupClientEncryption(client.id);
    }
    
    this.clients.set(client.id, client);
    
    // Send current global model to client
    await this.sendModelToClient(client.id);
    
    console.log(`Client ${client.id} registered successfully`);
  }
  
  /**
   * Start federated training
   */
  async startTraining(): Promise<void> {
    if (this.isTraining) {
      console.log('Federated training already in progress');
      return;
    }
    
    if (this.clients.size < this.config.minClients) {
      throw new Error(`Insufficient clients: ${this.clients.size}/${this.config.minClients}`);
    }
    
    console.log('Starting federated training...');
    this.isTraining = true;
    
    // Start training rounds
    await this.executeTrainingRound();
  }
  
  /**
   * Execute a single training round
   */
  private async executeTrainingRound(): Promise<void> {
    this.currentRound++;
    console.log(`\n=== Starting Round ${this.currentRound} ===`);
    
    // Step 1: Select clients for this round
    const selectedClients = this.selectClients();
    console.log(`Selected ${selectedClients.length} clients for training`);
    
    // Step 2: Broadcast global model
    await this.broadcastModel(selectedClients);
    
    // Step 3: Collect local updates with timeout
    const updates = await this.collectLocalUpdates(selectedClients);
    
    if (updates.length < this.config.minClients) {
      console.log(`Insufficient updates: ${updates.length}/${this.config.minClients}`);
      // Retry or skip round
      if (this.isTraining) {
        setTimeout(() => this.executeTrainingRound(), 10000);
      }
      return;
    }
    
    // Step 4: Validate updates
    const validUpdates = await this.validateUpdates(updates);
    
    // Step 5: Apply differential privacy
    if (this.config.differentialPrivacy.enabled) {
      this.applyDifferentialPrivacy(validUpdates);
    }
    
    // Step 6: Aggregate updates
    const aggregatedWeights = await this.aggregateUpdates(validUpdates);
    
    // Step 7: Update global model
    this.updateGlobalModel(aggregatedWeights, validUpdates);
    
    // Step 8: Evaluate global model
    const metrics = await this.evaluateGlobalModel();
    console.log(`Round ${this.currentRound} complete:`);
    console.log(`  Loss: ${metrics.loss.toFixed(4)}`);
    console.log(`  Accuracy: ${metrics.accuracy.toFixed(4)}`);
    console.log(`  Privacy spent: ε=${this.privacyAccountant.totalEpsilon.toFixed(2)}`);
    
    // Step 9: Check stopping criteria
    if (this.shouldStop()) {
      console.log('Training complete!');
      this.isTraining = false;
      return;
    }
    
    // Step 10: Schedule next round
    if (this.isTraining) {
      setTimeout(() => this.executeTrainingRound(), 5000);
    }
  }
  
  /**
   * Select clients for training round
   */
  private selectClients(): FederatedClient[] {
    const availableClients = Array.from(this.clients.values())
      .filter(client => {
        // Check if client is available
        const timeSinceUpdate = Date.now() - client.lastUpdate.getTime();
        return timeSinceUpdate < this.config.roundTimeout * 1000;
      });
    
    // Random selection (can be improved with importance sampling)
    const selected: FederatedClient[] = [];
    const targetCount = Math.min(availableClients.length, this.config.minClients * 2);
    
    while (selected.length < targetCount && availableClients.length > 0) {
      const idx = Math.floor(Math.random() * availableClients.length);
      selected.push(availableClients[idx]);
      availableClients.splice(idx, 1);
    }
    
    return selected;
  }
  
  /**
   * Broadcast model to selected clients
   */
  private async broadcastModel(clients: FederatedClient[]): Promise<void> {
    const broadcastPromises = clients.map(client => 
      this.sendModelToClient(client.id)
    );
    
    await Promise.all(broadcastPromises);
    console.log(`Model broadcasted to ${clients.length} clients`);
  }
  
  /**
   * Send model to specific client
   */
  private async sendModelToClient(clientId: string): Promise<void> {
    // In production, this would send over network
    // For simulation, we just log
    console.log(`Sending model v${this.globalModel.version} to client ${clientId}`);
  }
  
  /**
   * Collect local updates from clients
   */
  private async collectLocalUpdates(clients: FederatedClient[]): Promise<LocalUpdate[]> {
    const updates: LocalUpdate[] = [];
    const timeout = this.config.roundTimeout * 1000;
    const startTime = Date.now();
    
    // Simulate receiving updates from clients
    for (const client of clients) {
      if (Date.now() - startTime > timeout) {
        break; // Timeout reached
      }
      
      // Simulate local training at client
      const update = await this.simulateClientTraining(client);
      updates.push(update);
    }
    
    // Store updates for this round
    this.localUpdates.set(this.currentRound, updates);
    
    return updates;
  }
  
  /**
   * Simulate client training (in production, this happens on client device)
   */
  private async simulateClientTraining(client: FederatedClient): Promise<LocalUpdate> {
    // Create local learner
    const localLearner = new OnlineLearner({
      learningRate: 0.01,
      batchSize: 16,
      adaptiveLearning: true
    });
    
    // Import global weights
    localLearner.importWeights(this.globalModel.weights);
    
    // Simulate local training
    const numSamples = Math.floor(Math.random() * 1000) + 100;
    const samples: OnlineSample[] = [];
    
    for (let i = 0; i < numSamples; i++) {
      samples.push({
        id: `${client.id}_sample_${i}`,
        input: this.generateSampleInput(),
        target: this.generateSampleTarget(),
        weight: 1.0,
        timestamp: new Date(),
        source: client.organizationId
      });
    }
    
    // Train on local data
    for (const sample of samples) {
      await localLearner.addSample(sample);
    }
    
    // Get updated weights
    const updatedWeights = localLearner.exportWeights();
    
    // Compute weight differences
    const weightDeltas = new Map<string, Float32Array>();
    updatedWeights.forEach((newWeights, key) => {
      const oldWeights = this.globalModel.weights.get(key);
      if (oldWeights) {
        const delta = new Float32Array(newWeights.length);
        for (let i = 0; i < newWeights.length; i++) {
          delta[i] = newWeights[i] - oldWeights[i];
        }
        weightDeltas.set(key, delta);
      }
    });
    
    // Get metrics
    const metrics = localLearner.getMetrics();
    
    return {
      clientId: client.id,
      round: this.currentRound,
      weights: weightDeltas,
      metrics: {
        loss: metrics.loss,
        accuracy: metrics.accuracy,
        samplesUsed: numSamples
      },
      timestamp: new Date(),
      signature: this.signUpdate(client.id, weightDeltas)
    };
  }
  
  /**
   * Validate updates from clients
   */
  private async validateUpdates(updates: LocalUpdate[]): Promise<LocalUpdate[]> {
    if (!this.config.validation.enabled) {
      return updates;
    }
    
    const validUpdates: LocalUpdate[] = [];
    
    for (const update of updates) {
      // Check signature
      if (!this.verifySignature(update)) {
        console.log(`Invalid signature from client ${update.clientId}`);
        continue;
      }
      
      // Check metrics
      if (update.metrics.accuracy < this.config.validation.threshold) {
        console.log(`Low accuracy from client ${update.clientId}: ${update.metrics.accuracy}`);
        continue;
      }
      
      // Check for anomalies
      if (this.detectAnomaly(update)) {
        console.log(`Anomaly detected from client ${update.clientId}`);
        continue;
      }
      
      validUpdates.push(update);
    }
    
    console.log(`Validated ${validUpdates.length}/${updates.length} updates`);
    return validUpdates;
  }
  
  /**
   * Apply differential privacy to updates
   */
  private applyDifferentialPrivacy(updates: LocalUpdate[]): void {
    const { epsilon, delta, clippingNorm } = this.config.differentialPrivacy;
    
    updates.forEach(update => {
      // Clip gradients
      let totalNorm = 0;
      update.weights.forEach(weights => {
        for (let i = 0; i < weights.length; i++) {
          totalNorm += weights[i] * weights[i];
        }
      });
      totalNorm = Math.sqrt(totalNorm);
      
      const scale = Math.min(1, clippingNorm / totalNorm);
      
      // Apply clipping and add noise
      update.weights.forEach((weights, key) => {
        // Clip
        for (let i = 0; i < weights.length; i++) {
          weights[i] *= scale;
        }
        
        // Add Gaussian noise
        const sensitivity = 2 * clippingNorm / updates.length;
        const sigma = sensitivity * Math.sqrt(2 * Math.log(1.25 / delta)) / epsilon;
        
        for (let i = 0; i < weights.length; i++) {
          weights[i] += this.gaussianNoise() * sigma;
        }
        
        // Record noise level
        this.privacyMetrics.noiseLevels.set(key, sigma);
      });
    });
    
    // Update privacy accountant
    this.privacyAccountant.totalEpsilon += epsilon;
    this.privacyAccountant.totalDelta += delta;
    this.privacyAccountant.queryCount++;
    
    this.privacyMetrics.privacySpent = this.privacyAccountant.totalEpsilon;
  }
  
  /**
   * Aggregate updates using specified strategy
   */
  private async aggregateUpdates(updates: LocalUpdate[]): Promise<Map<string, Float32Array>> {
    switch (this.config.aggregationStrategy) {
      case 'average':
        return this.averageAggregation(updates);
      
      case 'weighted':
        return this.weightedAggregation(updates);
      
      case 'secure':
        return this.secureAggregation(updates);
      
      default:
        return this.averageAggregation(updates);
    }
  }
  
  /**
   * Simple average aggregation
   */
  private averageAggregation(updates: LocalUpdate[]): Map<string, Float32Array> {
    const aggregated = new Map<string, Float32Array>();
    
    // Initialize with zeros
    updates[0].weights.forEach((_, key) => {
      const size = updates[0].weights.get(key)!.length;
      aggregated.set(key, new Float32Array(size));
    });
    
    // Sum all updates
    updates.forEach(update => {
      update.weights.forEach((weights, key) => {
        const sum = aggregated.get(key)!;
        for (let i = 0; i < weights.length; i++) {
          sum[i] += weights[i];
        }
      });
    });
    
    // Average
    aggregated.forEach(weights => {
      for (let i = 0; i < weights.length; i++) {
        weights[i] /= updates.length;
      }
    });
    
    return aggregated;
  }
  
  /**
   * Weighted aggregation based on data size
   */
  private weightedAggregation(updates: LocalUpdate[]): Map<string, Float32Array> {
    const aggregated = new Map<string, Float32Array>();
    
    // Calculate total samples
    const totalSamples = updates.reduce((sum, update) => 
      sum + update.metrics.samplesUsed, 0
    );
    
    // Initialize with zeros
    updates[0].weights.forEach((_, key) => {
      const size = updates[0].weights.get(key)!.length;
      aggregated.set(key, new Float32Array(size));
    });
    
    // Weighted sum
    updates.forEach(update => {
      const weight = update.metrics.samplesUsed / totalSamples;
      
      update.weights.forEach((weights, key) => {
        const sum = aggregated.get(key)!;
        for (let i = 0; i < weights.length; i++) {
          sum[i] += weights[i] * weight;
        }
      });
      
      // Record contribution
      this.privacyMetrics.clientContributions.set(update.clientId, weight);
    });
    
    return aggregated;
  }
  
  /**
   * Secure aggregation with masking
   */
  private secureAggregation(updates: LocalUpdate[]): Map<string, Float32Array> {
    const aggregated = new Map<string, Float32Array>();
    
    // Initialize with zeros
    updates[0].weights.forEach((_, key) => {
      const size = updates[0].weights.get(key)!.length;
      aggregated.set(key, new Float32Array(size));
    });
    
    // Apply masks and aggregate
    updates.forEach(update => {
      // Generate pairwise masks with other clients
      const mask = this.generateMask(update.clientId, updates.length);
      
      update.weights.forEach((weights, key) => {
        const sum = aggregated.get(key)!;
        const maskValues = mask.get(key) || new Float32Array(weights.length);
        
        for (let i = 0; i < weights.length; i++) {
          // Add masked weight
          sum[i] += weights[i] + maskValues[i];
        }
      });
    });
    
    // Masks cancel out in aggregation
    aggregated.forEach(weights => {
      for (let i = 0; i < weights.length; i++) {
        weights[i] /= updates.length;
      }
    });
    
    return aggregated;
  }
  
  /**
   * Update global model with aggregated weights
   */
  private updateGlobalModel(
    aggregatedWeights: Map<string, Float32Array>,
    updates: LocalUpdate[]
  ): void {
    // Apply updates to global model
    aggregatedWeights.forEach((delta, key) => {
      const currentWeights = this.globalModel.weights.get(key);
      if (currentWeights) {
        for (let i = 0; i < currentWeights.length; i++) {
          currentWeights[i] += delta[i];
        }
      }
    });
    
    // Update metadata
    this.globalModel.round = this.currentRound;
    this.globalModel.participatingClients = updates.map(u => u.clientId);
    this.globalModel.timestamp = new Date();
    this.globalModel.version = `${this.currentRound}.0.0`;
    
    // Update aggregated metrics
    const totalLoss = updates.reduce((sum, u) => sum + u.metrics.loss, 0);
    const totalAccuracy = updates.reduce((sum, u) => sum + u.metrics.accuracy, 0);
    const totalSamples = updates.reduce((sum, u) => sum + u.metrics.samplesUsed, 0);
    
    this.globalModel.aggregatedMetrics = {
      avgLoss: totalLoss / updates.length,
      avgAccuracy: totalAccuracy / updates.length,
      totalSamples
    };
  }
  
  /**
   * Evaluate global model performance
   */
  private async evaluateGlobalModel(): Promise<{ loss: number; accuracy: number }> {
    // In production, evaluate on held-out test set
    // For simulation, return current metrics
    return {
      loss: this.globalModel.aggregatedMetrics.avgLoss,
      accuracy: this.globalModel.aggregatedMetrics.avgAccuracy
    };
  }
  
  /**
   * Check if training should stop
   */
  private shouldStop(): boolean {
    // Check privacy budget
    if (this.privacyAccountant.totalEpsilon > 10) {
      console.log('Privacy budget exhausted');
      return true;
    }
    
    // Check convergence
    if (this.currentRound > 100) {
      console.log('Maximum rounds reached');
      return true;
    }
    
    // Check accuracy
    if (this.globalModel.aggregatedMetrics.avgAccuracy > 0.95) {
      console.log('Target accuracy achieved');
      return true;
    }
    
    return false;
  }
  
  // Helper methods
  
  private validateClient(client: FederatedClient): boolean {
    // Validate client properties
    return (
      client.id.length > 0 &&
      client.organizationId.length > 0 &&
      client.dataSize > 0 &&
      client.trustScore >= 0 &&
      client.trustScore <= 1
    );
  }
  
  private async setupClientEncryption(clientId: string): Promise<void> {
    // Generate public/private key pair for client
    const publicKey = `public_key_${clientId}_${Date.now()}`;
    this.secureAggregation.publicKeys.set(clientId, publicKey);
  }
  
  private signUpdate(clientId: string, weights: Map<string, Float32Array>): string {
    // Simple signature (in production, use proper cryptographic signing)
    let hash = 0;
    weights.forEach(w => {
      for (let i = 0; i < Math.min(10, w.length); i++) {
        hash += w[i];
      }
    });
    return `sig_${clientId}_${hash.toFixed(4)}`;
  }
  
  private verifySignature(update: LocalUpdate): boolean {
    // Verify signature (simplified)
    return update.signature.startsWith(`sig_${update.clientId}_`);
  }
  
  private detectAnomaly(update: LocalUpdate): boolean {
    // Simple anomaly detection
    // Check if updates are too large
    let maxChange = 0;
    update.weights.forEach(weights => {
      for (let i = 0; i < weights.length; i++) {
        maxChange = Math.max(maxChange, Math.abs(weights[i]));
      }
    });
    
    return maxChange > 10; // Threshold for anomaly
  }
  
  private gaussianNoise(): number {
    // Box-Muller transform for Gaussian noise
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
  
  private generateMask(clientId: string, numClients: number): Map<string, Float32Array> {
    const mask = new Map<string, Float32Array>();
    
    // Generate deterministic mask based on client ID
    const seed = clientId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const random = this.seededRandom(seed);
    
    this.globalModel.weights.forEach((weights, key) => {
      const maskValues = new Float32Array(weights.length);
      for (let i = 0; i < maskValues.length; i++) {
        // Masks sum to zero across all clients
        maskValues[i] = (random() - 0.5) * 0.01;
      }
      mask.set(key, maskValues);
    });
    
    return mask;
  }
  
  private seededRandom(seed: number): () => number {
    return () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
  }
  
  private generateSampleInput(): any {
    // Generate random API-like features
    return {
      pathCount: Math.floor(Math.random() * 50) + 1,
      schemaCount: Math.floor(Math.random() * 20) + 1,
      securitySchemes: Math.floor(Math.random() * 3),
      hasAuth: Math.random() > 0.5,
      hasRateLimiting: Math.random() > 0.7,
      hasPagination: Math.random() > 0.6
    };
  }
  
  private generateSampleTarget(): string {
    const types = ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'AsyncAPI'];
    return types[Math.floor(Math.random() * types.length)];
  }
  
  /**
   * Get current federated learning statistics
   */
  getStatistics(): {
    round: number;
    numClients: number;
    globalAccuracy: number;
    privacySpent: number;
    totalSamples: number;
  } {
    return {
      round: this.currentRound,
      numClients: this.clients.size,
      globalAccuracy: this.globalModel.aggregatedMetrics.avgAccuracy,
      privacySpent: this.privacyAccountant.totalEpsilon,
      totalSamples: this.globalModel.aggregatedMetrics.totalSamples
    };
  }
  
  /**
   * Export global model
   */
  exportGlobalModel(): GlobalModel {
    return { ...this.globalModel };
  }
}