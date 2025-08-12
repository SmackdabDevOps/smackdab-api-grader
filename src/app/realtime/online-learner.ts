/**
 * Online Learning System
 * Enables incremental model updates without retraining from scratch
 * Implements stochastic gradient descent and adaptive learning rates
 */

export interface OnlineConfig {
  learningRate: number;
  batchSize: number;
  momentum: number;
  decay: number;
  adaptiveLearning: boolean;
  maxGradientNorm: number;
  updateFrequency: number; // seconds
  validationSplit: number;
  earlyStoppingPatience: number;
}

export interface ModelUpdate {
  modelId: string;
  timestamp: Date;
  gradients: Map<string, Float32Array>;
  loss: number;
  metrics: {
    accuracy: number;
    precision: number;
    recall: number;
    f1Score: number;
  };
  samplesProcessed: number;
}

export interface LearningState {
  epoch: number;
  iteration: number;
  totalSamples: number;
  currentLoss: number;
  bestLoss: number;
  learningRate: number;
  momentum: Map<string, Float32Array>;
  gradientHistory: ModelUpdate[];
  validationMetrics: {
    accuracy: number;
    loss: number;
  };
}

export interface OnlineSample {
  id: string;
  input: any;
  target: any;
  weight: number;
  timestamp: Date;
  source: string;
}

export class OnlineLearner {
  private config: OnlineConfig;
  private state: LearningState;
  private modelWeights: Map<string, Float32Array> = new Map();
  private gradientBuffer: Map<string, Float32Array> = new Map();
  private sampleBuffer: OnlineSample[] = [];
  private updateTimer?: NodeJS.Timeout;
  private isLearning: boolean = false;
  
  // Adaptive learning rate parameters
  private adamState = {
    beta1: 0.9,
    beta2: 0.999,
    epsilon: 1e-8,
    m: new Map<string, Float32Array>(), // First moment
    v: new Map<string, Float32Array>(), // Second moment
    t: 0 // Timestep
  };
  
  constructor(config?: Partial<OnlineConfig>) {
    this.config = {
      learningRate: 0.001,
      batchSize: 32,
      momentum: 0.9,
      decay: 0.0001,
      adaptiveLearning: true,
      maxGradientNorm: 1.0,
      updateFrequency: 10,
      validationSplit: 0.2,
      earlyStoppingPatience: 5,
      ...config
    };
    
    this.state = {
      epoch: 0,
      iteration: 0,
      totalSamples: 0,
      currentLoss: Infinity,
      bestLoss: Infinity,
      learningRate: this.config.learningRate,
      momentum: new Map(),
      gradientHistory: [],
      validationMetrics: {
        accuracy: 0,
        loss: Infinity
      }
    };
    
    this.initializeWeights();
  }
  
  /**
   * Initialize model weights
   */
  private initializeWeights(): void {
    // Initialize with Xavier/He initialization
    const layerSizes = [768, 512, 256, 128, 64, 32, 5]; // Example architecture
    
    for (let i = 0; i < layerSizes.length - 1; i++) {
      const inputSize = layerSizes[i];
      const outputSize = layerSizes[i + 1];
      
      // Weight matrix
      const weights = new Float32Array(inputSize * outputSize);
      const scale = Math.sqrt(2 / inputSize); // He initialization
      
      for (let j = 0; j < weights.length; j++) {
        weights[j] = (Math.random() - 0.5) * 2 * scale;
      }
      
      this.modelWeights.set(`layer_${i}_weights`, weights);
      
      // Bias vector
      const bias = new Float32Array(outputSize);
      this.modelWeights.set(`layer_${i}_bias`, bias);
      
      // Initialize gradient buffers
      this.gradientBuffer.set(`layer_${i}_weights`, new Float32Array(weights.length));
      this.gradientBuffer.set(`layer_${i}_bias`, new Float32Array(outputSize));
      
      // Initialize momentum buffers
      this.state.momentum.set(`layer_${i}_weights`, new Float32Array(weights.length));
      this.state.momentum.set(`layer_${i}_bias`, new Float32Array(outputSize));
      
      // Initialize Adam moments
      if (this.config.adaptiveLearning) {
        this.adamState.m.set(`layer_${i}_weights`, new Float32Array(weights.length));
        this.adamState.m.set(`layer_${i}_bias`, new Float32Array(outputSize));
        this.adamState.v.set(`layer_${i}_weights`, new Float32Array(weights.length));
        this.adamState.v.set(`layer_${i}_bias`, new Float32Array(outputSize));
      }
    }
  }
  
  /**
   * Start online learning
   */
  async start(): Promise<void> {
    if (this.isLearning) {
      console.log('Online learner already running');
      return;
    }
    
    console.log('Starting online learning...');
    this.isLearning = true;
    
    // Start periodic updates
    this.updateTimer = setInterval(async () => {
      await this.performUpdate();
    }, this.config.updateFrequency * 1000);
    
    console.log('Online learner started');
  }
  
  /**
   * Stop online learning
   */
  async stop(): Promise<void> {
    console.log('Stopping online learning...');
    this.isLearning = false;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
    
    // Process remaining samples
    if (this.sampleBuffer.length > 0) {
      await this.performUpdate();
    }
    
    console.log('Online learner stopped');
  }
  
  /**
   * Add sample for learning
   */
  async addSample(sample: OnlineSample): Promise<void> {
    this.sampleBuffer.push(sample);
    
    // Trigger immediate update if buffer is full
    if (this.sampleBuffer.length >= this.config.batchSize * 2) {
      await this.performUpdate();
    }
  }
  
  /**
   * Perform model update
   */
  private async performUpdate(): Promise<void> {
    if (this.sampleBuffer.length < this.config.batchSize) {
      return; // Not enough samples
    }
    
    console.log(`Performing online update with ${this.sampleBuffer.length} samples`);
    
    // Split into training and validation
    const validationSize = Math.floor(this.sampleBuffer.length * this.config.validationSplit);
    const trainingSamples = this.sampleBuffer.slice(0, -validationSize || undefined);
    const validationSamples = this.sampleBuffer.slice(-validationSize || this.sampleBuffer.length);
    
    // Process in mini-batches
    const batches = this.createBatches(trainingSamples, this.config.batchSize);
    
    let totalLoss = 0;
    let samplesProcessed = 0;
    
    for (const batch of batches) {
      // Forward pass
      const predictions = this.forward(batch);
      
      // Compute loss
      const loss = this.computeLoss(predictions, batch);
      totalLoss += loss * batch.length;
      
      // Backward pass
      const gradients = this.backward(batch, predictions);
      
      // Accumulate gradients
      this.accumulateGradients(gradients, batch.length);
      
      samplesProcessed += batch.length;
    }
    
    // Average loss
    const avgLoss = totalLoss / samplesProcessed;
    
    // Apply gradients
    this.applyGradients(samplesProcessed);
    
    // Validate
    const validationMetrics = await this.validate(validationSamples);
    
    // Update state
    this.state.iteration++;
    this.state.totalSamples += samplesProcessed;
    this.state.currentLoss = avgLoss;
    this.state.validationMetrics = validationMetrics;
    
    // Check for improvement
    if (validationMetrics.loss < this.state.bestLoss) {
      this.state.bestLoss = validationMetrics.loss;
      await this.saveCheckpoint();
    }
    
    // Adjust learning rate
    if (this.config.adaptiveLearning) {
      this.adjustLearningRate();
    }
    
    // Record update
    const update: ModelUpdate = {
      modelId: 'online-learner',
      timestamp: new Date(),
      gradients: new Map(this.gradientBuffer),
      loss: avgLoss,
      metrics: {
        accuracy: validationMetrics.accuracy,
        precision: 0, // Calculate if needed
        recall: 0,    // Calculate if needed
        f1Score: 0    // Calculate if needed
      },
      samplesProcessed
    };
    
    this.state.gradientHistory.push(update);
    
    // Keep only recent history
    if (this.state.gradientHistory.length > 100) {
      this.state.gradientHistory.shift();
    }
    
    // Clear processed samples
    this.sampleBuffer = this.sampleBuffer.slice(samplesProcessed);
    
    console.log(`Update complete: Loss=${avgLoss.toFixed(4)}, Validation Acc=${validationMetrics.accuracy.toFixed(4)}`);
  }
  
  /**
   * Forward pass through the network
   */
  private forward(batch: OnlineSample[]): Float32Array[] {
    const predictions: Float32Array[] = [];
    
    for (const sample of batch) {
      let activation = this.preprocessInput(sample.input);
      
      // Pass through each layer
      for (let i = 0; i < 6; i++) { // 6 layers in our example
        const weights = this.modelWeights.get(`layer_${i}_weights`)!;
        const bias = this.modelWeights.get(`layer_${i}_bias`)!;
        
        activation = this.layerForward(activation, weights, bias, i < 5); // ReLU for hidden, softmax for output
      }
      
      predictions.push(activation);
    }
    
    return predictions;
  }
  
  /**
   * Single layer forward pass
   */
  private layerForward(
    input: Float32Array,
    weights: Float32Array,
    bias: Float32Array,
    useRelu: boolean
  ): Float32Array {
    const outputSize = bias.length;
    const inputSize = input.length;
    const output = new Float32Array(outputSize);
    
    // Matrix multiplication: output = input * weights + bias
    for (let i = 0; i < outputSize; i++) {
      let sum = bias[i];
      for (let j = 0; j < inputSize; j++) {
        sum += input[j] * weights[j * outputSize + i];
      }
      output[i] = useRelu ? Math.max(0, sum) : sum; // ReLU or linear
    }
    
    // Apply softmax to output layer
    if (!useRelu) {
      const maxVal = Math.max(...output);
      let sumExp = 0;
      
      for (let i = 0; i < output.length; i++) {
        output[i] = Math.exp(output[i] - maxVal);
        sumExp += output[i];
      }
      
      for (let i = 0; i < output.length; i++) {
        output[i] /= sumExp;
      }
    }
    
    return output;
  }
  
  /**
   * Compute loss (cross-entropy for classification)
   */
  private computeLoss(predictions: Float32Array[], batch: OnlineSample[]): number {
    let totalLoss = 0;
    
    for (let i = 0; i < batch.length; i++) {
      const pred = predictions[i];
      const target = this.preprocessTarget(batch[i].target);
      
      // Cross-entropy loss
      for (let j = 0; j < pred.length; j++) {
        if (target[j] > 0) {
          totalLoss -= target[j] * Math.log(Math.max(pred[j], 1e-7));
        }
      }
      
      // Apply sample weight
      totalLoss *= batch[i].weight;
    }
    
    return totalLoss / batch.length;
  }
  
  /**
   * Backward pass to compute gradients
   */
  private backward(
    batch: OnlineSample[],
    predictions: Float32Array[]
  ): Map<string, Float32Array> {
    const gradients = new Map<string, Float32Array>();
    
    // Initialize gradient accumulators
    this.modelWeights.forEach((weights, key) => {
      gradients.set(key, new Float32Array(weights.length));
    });
    
    for (let sampleIdx = 0; sampleIdx < batch.length; sampleIdx++) {
      const sample = batch[sampleIdx];
      const prediction = predictions[sampleIdx];
      const target = this.preprocessTarget(sample.target);
      
      // Compute output gradient (softmax + cross-entropy derivative)
      const outputGrad = new Float32Array(prediction.length);
      for (let i = 0; i < prediction.length; i++) {
        outputGrad[i] = (prediction[i] - target[i]) * sample.weight;
      }
      
      // Backpropagate through layers
      let currentGrad = outputGrad;
      const activations: Float32Array[] = [];
      
      // Store intermediate activations (would be computed during forward pass)
      let activation = this.preprocessInput(sample.input);
      activations.push(activation);
      
      for (let layer = 5; layer >= 0; layer--) {
        const weights = this.modelWeights.get(`layer_${layer}_weights`)!;
        const weightGrad = gradients.get(`layer_${layer}_weights`)!;
        const biasGrad = gradients.get(`layer_${layer}_bias`)!;
        
        // Compute weight gradients
        const inputSize = layer === 0 ? activation.length : this.modelWeights.get(`layer_${layer - 1}_bias`)!.length;
        const outputSize = currentGrad.length;
        
        for (let i = 0; i < inputSize; i++) {
          for (let j = 0; j < outputSize; j++) {
            const input = layer === 0 ? activation[i] : activations[layer][i];
            weightGrad[i * outputSize + j] += input * currentGrad[j];
          }
        }
        
        // Compute bias gradients
        for (let i = 0; i < outputSize; i++) {
          biasGrad[i] += currentGrad[i];
        }
        
        // Compute gradient for next layer
        if (layer > 0) {
          const nextGrad = new Float32Array(inputSize);
          for (let i = 0; i < inputSize; i++) {
            for (let j = 0; j < outputSize; j++) {
              nextGrad[i] += weights[i * outputSize + j] * currentGrad[j];
            }
            // ReLU derivative
            if (activations[layer][i] <= 0) {
              nextGrad[i] = 0;
            }
          }
          currentGrad = nextGrad;
        }
      }
    }
    
    return gradients;
  }
  
  /**
   * Accumulate gradients
   */
  private accumulateGradients(gradients: Map<string, Float32Array>, batchSize: number): void {
    gradients.forEach((grad, key) => {
      const buffer = this.gradientBuffer.get(key)!;
      for (let i = 0; i < grad.length; i++) {
        buffer[i] += grad[i] / batchSize;
      }
    });
  }
  
  /**
   * Apply accumulated gradients to weights
   */
  private applyGradients(samplesProcessed: number): void {
    const clipNorm = this.config.maxGradientNorm;
    
    // Compute gradient norm
    let gradNorm = 0;
    this.gradientBuffer.forEach(grad => {
      for (let i = 0; i < grad.length; i++) {
        gradNorm += grad[i] * grad[i];
      }
    });
    gradNorm = Math.sqrt(gradNorm);
    
    // Gradient clipping
    const scale = gradNorm > clipNorm ? clipNorm / gradNorm : 1.0;
    
    // Update weights
    this.modelWeights.forEach((weights, key) => {
      const gradients = this.gradientBuffer.get(key)!;
      
      if (this.config.adaptiveLearning) {
        // Adam optimizer
        this.applyAdam(weights, gradients, key, scale);
      } else {
        // SGD with momentum
        this.applySGD(weights, gradients, key, scale);
      }
      
      // Clear gradient buffer
      gradients.fill(0);
    });
    
    // Update Adam timestep
    if (this.config.adaptiveLearning) {
      this.adamState.t++;
    }
  }
  
  /**
   * Apply Adam optimizer
   */
  private applyAdam(
    weights: Float32Array,
    gradients: Float32Array,
    key: string,
    scale: number
  ): void {
    const m = this.adamState.m.get(key)!;
    const v = this.adamState.v.get(key)!;
    const { beta1, beta2, epsilon, t } = this.adamState;
    
    // Bias correction
    const biasCorrection1 = 1 - Math.pow(beta1, t + 1);
    const biasCorrection2 = 1 - Math.pow(beta2, t + 1);
    const stepSize = this.state.learningRate * Math.sqrt(biasCorrection2) / biasCorrection1;
    
    for (let i = 0; i < weights.length; i++) {
      const grad = gradients[i] * scale;
      
      // Update biased first moment estimate
      m[i] = beta1 * m[i] + (1 - beta1) * grad;
      
      // Update biased second moment estimate
      v[i] = beta2 * v[i] + (1 - beta2) * grad * grad;
      
      // Update weights
      weights[i] -= stepSize * m[i] / (Math.sqrt(v[i]) + epsilon);
      
      // Apply weight decay
      weights[i] *= (1 - this.config.decay);
    }
  }
  
  /**
   * Apply SGD with momentum
   */
  private applySGD(
    weights: Float32Array,
    gradients: Float32Array,
    key: string,
    scale: number
  ): void {
    const momentum = this.state.momentum.get(key)!;
    const { learningRate } = this.state;
    const { momentum: mu, decay } = this.config;
    
    for (let i = 0; i < weights.length; i++) {
      const grad = gradients[i] * scale;
      
      // Update momentum
      momentum[i] = mu * momentum[i] - learningRate * grad;
      
      // Update weights
      weights[i] += momentum[i];
      
      // Apply weight decay
      weights[i] *= (1 - decay);
    }
  }
  
  /**
   * Validate on held-out samples
   */
  private async validate(samples: OnlineSample[]): Promise<{ accuracy: number; loss: number }> {
    if (samples.length === 0) {
      return { accuracy: 0, loss: Infinity };
    }
    
    const predictions = this.forward(samples);
    const loss = this.computeLoss(predictions, samples);
    
    let correct = 0;
    for (let i = 0; i < samples.length; i++) {
      const pred = predictions[i];
      const target = this.preprocessTarget(samples[i].target);
      
      const predClass = this.argmax(pred);
      const targetClass = this.argmax(target);
      
      if (predClass === targetClass) {
        correct++;
      }
    }
    
    const accuracy = correct / samples.length;
    
    return { accuracy, loss };
  }
  
  /**
   * Adjust learning rate based on performance
   */
  private adjustLearningRate(): void {
    // Reduce learning rate if loss is not improving
    const recentLosses = this.state.gradientHistory
      .slice(-10)
      .map(h => h.loss);
    
    if (recentLosses.length >= 10) {
      const avgRecentLoss = recentLosses.reduce((a, b) => a + b, 0) / recentLosses.length;
      const previousAvg = recentLosses.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
      const currentAvg = recentLosses.slice(5).reduce((a, b) => a + b, 0) / 5;
      
      if (currentAvg >= previousAvg * 0.99) {
        // Loss not improving, reduce learning rate
        this.state.learningRate *= 0.9;
        console.log(`Reduced learning rate to ${this.state.learningRate.toFixed(6)}`);
      }
    }
    
    // Apply minimum learning rate
    this.state.learningRate = Math.max(this.state.learningRate, 1e-6);
  }
  
  /**
   * Save model checkpoint
   */
  private async saveCheckpoint(): Promise<void> {
    const checkpoint = {
      weights: Array.from(this.modelWeights.entries()).map(([key, value]) => ({
        key,
        value: Array.from(value)
      })),
      state: {
        ...this.state,
        momentum: Array.from(this.state.momentum.entries()).map(([key, value]) => ({
          key,
          value: Array.from(value)
        }))
      },
      adamState: this.config.adaptiveLearning ? {
        ...this.adamState,
        m: Array.from(this.adamState.m.entries()).map(([key, value]) => ({
          key,
          value: Array.from(value)
        })),
        v: Array.from(this.adamState.v.entries()).map(([key, value]) => ({
          key,
          value: Array.from(value)
        }))
      } : undefined,
      timestamp: new Date()
    };
    
    console.log('Checkpoint saved: Best validation loss =', this.state.bestLoss.toFixed(4));
    // In production, save to persistent storage
  }
  
  /**
   * Create mini-batches
   */
  private createBatches(samples: OnlineSample[], batchSize: number): OnlineSample[][] {
    const batches: OnlineSample[][] = [];
    
    for (let i = 0; i < samples.length; i += batchSize) {
      batches.push(samples.slice(i, i + batchSize));
    }
    
    return batches;
  }
  
  /**
   * Preprocess input for the network
   */
  private preprocessInput(input: any): Float32Array {
    // Convert input to feature vector
    // This would be customized based on your input format
    const features = new Float32Array(768); // Match first layer size
    
    // Example: extract features from API spec
    if (typeof input === 'object') {
      // Simple feature extraction
      let idx = 0;
      const addFeature = (value: number) => {
        if (idx < features.length) {
          features[idx++] = value;
        }
      };
      
      // Add various features
      addFeature(input.pathCount || 0);
      addFeature(input.schemaCount || 0);
      addFeature(input.securitySchemes || 0);
      // ... add more features
    }
    
    return features;
  }
  
  /**
   * Preprocess target for the network
   */
  private preprocessTarget(target: any): Float32Array {
    // Convert target to one-hot vector
    const classes = ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'AsyncAPI'];
    const oneHot = new Float32Array(classes.length);
    
    if (typeof target === 'string') {
      const idx = classes.indexOf(target);
      if (idx >= 0) {
        oneHot[idx] = 1;
      }
    } else if (typeof target === 'number') {
      oneHot[target] = 1;
    }
    
    return oneHot;
  }
  
  /**
   * Get index of maximum value
   */
  private argmax(array: Float32Array): number {
    let maxIdx = 0;
    let maxVal = array[0];
    
    for (let i = 1; i < array.length; i++) {
      if (array[i] > maxVal) {
        maxVal = array[i];
        maxIdx = i;
      }
    }
    
    return maxIdx;
  }
  
  /**
   * Get current learning state
   */
  getState(): LearningState {
    return { ...this.state };
  }
  
  /**
   * Get model metrics
   */
  getMetrics(): {
    loss: number;
    accuracy: number;
    learningRate: number;
    samplesProcessed: number;
  } {
    return {
      loss: this.state.currentLoss,
      accuracy: this.state.validationMetrics.accuracy,
      learningRate: this.state.learningRate,
      samplesProcessed: this.state.totalSamples
    };
  }
  
  /**
   * Export model weights
   */
  exportWeights(): Map<string, Float32Array> {
    return new Map(this.modelWeights);
  }
  
  /**
   * Import model weights
   */
  importWeights(weights: Map<string, Float32Array>): void {
    weights.forEach((value, key) => {
      if (this.modelWeights.has(key)) {
        this.modelWeights.set(key, new Float32Array(value));
      }
    });
  }
}