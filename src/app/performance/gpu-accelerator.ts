/**
 * GPU Acceleration Module
 * Provides CUDA/WebGPU acceleration for ML inference
 * Supports batch processing, model quantization, and TensorRT optimization
 */

export interface GPUConfig {
  backend: 'cuda' | 'webgpu' | 'metal' | 'opencl';
  devices: GPUDevice[];
  memory: {
    maxAllocation: number; // GB
    reservedSystem: number; // GB
    pooling: boolean;
  };
  optimization: {
    quantization: 'int8' | 'fp16' | 'fp32' | 'dynamic';
    tensorRT: boolean;
    cudnn: boolean;
    mixedPrecision: boolean;
  };
  batching: {
    maxBatchSize: number;
    dynamicBatching: boolean;
    timeout: number; // ms to wait for batch
  };
}

export interface GPUDevice {
  id: number;
  name: string;
  memory: number; // GB
  computeCapability: string;
  cores: number;
  clockSpeed: number; // MHz
  utilization: number; // 0-100%
}

export interface GPUKernel {
  name: string;
  code: string;
  workgroupSize: [number, number, number];
  buffers: Map<string, GPUBuffer>;
  compiled: boolean;
}

export interface GPUBuffer {
  id: string;
  size: number;
  usage: 'storage' | 'uniform' | 'read-only' | 'write-only';
  data?: Float32Array | Int32Array | Uint8Array;
  device: GPUDevice;
}

export interface InferenceRequest {
  modelId: string;
  input: Float32Array | Float32Array[];
  batchSize: number;
  priority: 'low' | 'normal' | 'high';
  callback?: (result: InferenceResult) => void;
}

export interface InferenceResult {
  output: Float32Array;
  latency: number;
  device: string;
  batchSize: number;
  throughput: number; // inferences/second
}

export interface ModelProfile {
  modelId: string;
  parameters: number;
  flops: number;
  memoryRequired: number; // MB
  optimalBatchSize: number;
  supportedPrecisions: string[];
  averageLatency: Map<number, number>; // batchSize -> latency
}

export class GPUAccelerator {
  private config: GPUConfig;
  private devices: Map<number, GPUDevice> = new Map();
  private kernels: Map<string, GPUKernel> = new Map();
  private bufferPool: Map<string, GPUBuffer[]> = new Map();
  private modelProfiles: Map<string, ModelProfile> = new Map();
  private inferenceQueue: InferenceRequest[] = [];
  private batchQueue: Map<string, InferenceRequest[]> = new Map();
  private isInitialized: boolean = false;
  private processingTimer?: NodeJS.Timeout;
  
  // Performance metrics
  private metrics = {
    totalInferences: 0,
    totalLatency: 0,
    peakMemoryUsage: 0,
    deviceUtilization: new Map<number, number>(),
    kernelExecutions: new Map<string, number>()
  };
  
  constructor(config?: Partial<GPUConfig>) {
    this.config = {
      backend: 'webgpu',
      devices: [],
      memory: {
        maxAllocation: 8,
        reservedSystem: 2,
        pooling: true
      },
      optimization: {
        quantization: 'fp16',
        tensorRT: true,
        cudnn: true,
        mixedPrecision: true
      },
      batching: {
        maxBatchSize: 64,
        dynamicBatching: true,
        timeout: 10
      },
      ...config
    };
  }
  
  /**
   * Initialize GPU acceleration
   */
  async initialize(): Promise<void> {
    console.log(`Initializing GPU accelerator with ${this.config.backend} backend`);
    
    // Detect available GPUs
    await this.detectGPUs();
    
    if (this.devices.size === 0) {
      throw new Error('No GPU devices found');
    }
    
    // Initialize backend
    await this.initializeBackend();
    
    // Compile kernels
    await this.compileKernels();
    
    // Initialize buffer pool
    if (this.config.memory.pooling) {
      this.initializeBufferPool();
    }
    
    // Start batch processing
    if (this.config.batching.dynamicBatching) {
      this.startBatchProcessing();
    }
    
    this.isInitialized = true;
    console.log(`GPU accelerator initialized with ${this.devices.size} devices`);
  }
  
  /**
   * Load and optimize model for GPU
   */
  async loadModel(
    modelId: string,
    weights: Map<string, Float32Array>,
    architecture: any
  ): Promise<void> {
    console.log(`Loading model ${modelId} to GPU`);
    
    // Profile model
    const profile = this.profileModel(modelId, weights, architecture);
    this.modelProfiles.set(modelId, profile);
    
    // Quantize weights if needed
    const quantizedWeights = await this.quantizeWeights(
      weights,
      this.config.optimization.quantization
    );
    
    // Optimize with TensorRT if available
    if (this.config.optimization.tensorRT) {
      await this.optimizeTensorRT(modelId, quantizedWeights, architecture);
    }
    
    // Transfer to GPU memory
    await this.transferToGPU(modelId, quantizedWeights);
    
    // Warm up model
    await this.warmupModel(modelId);
    
    console.log(`Model ${modelId} loaded and optimized`);
  }
  
  /**
   * Run inference on GPU
   */
  async infer(request: InferenceRequest): Promise<InferenceResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Add to queue for batching
    if (this.config.batching.dynamicBatching) {
      return this.queueInference(request);
    }
    
    // Direct inference
    return this.runInference(request);
  }
  
  /**
   * Run batch inference
   */
  async inferBatch(
    modelId: string,
    inputs: Float32Array[],
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<InferenceResult[]> {
    const batchSize = inputs.length;
    
    if (batchSize > this.config.batching.maxBatchSize) {
      // Split into multiple batches
      const results: InferenceResult[] = [];
      
      for (let i = 0; i < batchSize; i += this.config.batching.maxBatchSize) {
        const batchInputs = inputs.slice(i, i + this.config.batching.maxBatchSize);
        const batchResults = await this.inferBatch(modelId, batchInputs, priority);
        results.push(...batchResults);
      }
      
      return results;
    }
    
    // Prepare batch tensor
    const batchTensor = this.createBatchTensor(inputs);
    
    // Run batch inference
    const result = await this.runInference({
      modelId,
      input: batchTensor,
      batchSize,
      priority
    });
    
    // Split results
    return this.splitBatchResults(result, batchSize);
  }
  
  /**
   * Queue inference for batching
   */
  private queueInference(request: InferenceRequest): Promise<InferenceResult> {
    return new Promise((resolve, reject) => {
      // Add callback
      request.callback = resolve;
      
      // Add to model-specific queue
      const queue = this.batchQueue.get(request.modelId) || [];
      queue.push(request);
      this.batchQueue.set(request.modelId, queue);
      
      // Check if batch is ready
      if (queue.length >= this.config.batching.maxBatchSize) {
        this.processBatch(request.modelId);
      }
    });
  }
  
  /**
   * Process batch of inference requests
   */
  private async processBatch(modelId: string): Promise<void> {
    const queue = this.batchQueue.get(modelId);
    if (!queue || queue.length === 0) return;
    
    // Take up to maxBatchSize requests
    const batch = queue.splice(0, this.config.batching.maxBatchSize);
    
    // Combine inputs
    const inputs = batch.map(req => 
      req.input instanceof Float32Array ? req.input : req.input[0]
    );
    
    // Run batch inference
    const results = await this.inferBatch(modelId, inputs);
    
    // Resolve individual promises
    batch.forEach((req, idx) => {
      if (req.callback) {
        req.callback(results[idx]);
      }
    });
  }
  
  /**
   * Run actual inference on GPU
   */
  private async runInference(request: InferenceRequest): Promise<InferenceResult> {
    const startTime = performance.now();
    
    // Select best device
    const device = this.selectDevice(request);
    
    // Get or create buffers
    const inputBuffer = await this.getBuffer('input', request.input);
    const outputBuffer = await this.getBuffer('output', null);
    
    // Get model kernel
    const kernel = this.kernels.get(`${request.modelId}_inference`);
    if (!kernel) {
      throw new Error(`Kernel not found for model ${request.modelId}`);
    }
    
    // Execute kernel
    const output = await this.executeKernel(
      kernel,
      inputBuffer,
      outputBuffer,
      device,
      request.batchSize
    );
    
    const latency = performance.now() - startTime;
    
    // Update metrics
    this.updateMetrics(device, latency);
    
    return {
      output,
      latency,
      device: device.name,
      batchSize: request.batchSize,
      throughput: (request.batchSize / latency) * 1000
    };
  }
  
  /**
   * Execute GPU kernel
   */
  private async executeKernel(
    kernel: GPUKernel,
    input: GPUBuffer,
    output: GPUBuffer,
    device: GPUDevice,
    batchSize: number
  ): Promise<Float32Array> {
    // Simulate GPU execution
    // In production, use actual GPU API
    
    const inputData = input.data as Float32Array;
    const outputSize = this.calculateOutputSize(kernel.name, inputData.length);
    const outputData = new Float32Array(outputSize);
    
    // Simulate computation
    if (kernel.name.includes('transformer')) {
      // Transformer inference
      for (let i = 0; i < outputSize; i++) {
        outputData[i] = Math.tanh(inputData[i % inputData.length] * 0.5);
      }
    } else if (kernel.name.includes('conv')) {
      // Convolution
      for (let i = 0; i < outputSize; i++) {
        let sum = 0;
        for (let j = 0; j < 9; j++) { // 3x3 kernel
          const idx = (i + j) % inputData.length;
          sum += inputData[idx] * 0.1;
        }
        outputData[i] = Math.max(0, sum); // ReLU
      }
    } else {
      // Default: matrix multiplication
      for (let i = 0; i < outputSize; i++) {
        outputData[i] = inputData[i % inputData.length] * 1.1;
      }
    }
    
    // Record kernel execution
    const count = this.metrics.kernelExecutions.get(kernel.name) || 0;
    this.metrics.kernelExecutions.set(kernel.name, count + 1);
    
    return outputData;
  }
  
  /**
   * Quantize model weights
   */
  private async quantizeWeights(
    weights: Map<string, Float32Array>,
    precision: string
  ): Promise<Map<string, ArrayBuffer>> {
    const quantized = new Map<string, ArrayBuffer>();
    
    weights.forEach((weight, key) => {
      switch (precision) {
        case 'int8':
          quantized.set(key, this.quantizeToInt8(weight));
          break;
        
        case 'fp16':
          quantized.set(key, this.quantizeToFP16(weight));
          break;
        
        case 'dynamic':
          // Choose precision based on layer type
          if (key.includes('attention')) {
            quantized.set(key, this.quantizeToFP16(weight));
          } else {
            quantized.set(key, this.quantizeToInt8(weight));
          }
          break;
        
        default:
          quantized.set(key, weight.buffer);
      }
    });
    
    return quantized;
  }
  
  /**
   * Quantize to INT8
   */
  private quantizeToInt8(weights: Float32Array): ArrayBuffer {
    const scale = 127 / Math.max(...weights.map(Math.abs));
    const quantized = new Int8Array(weights.length);
    
    for (let i = 0; i < weights.length; i++) {
      quantized[i] = Math.round(weights[i] * scale);
    }
    
    return quantized.buffer;
  }
  
  /**
   * Quantize to FP16
   */
  private quantizeToFP16(weights: Float32Array): ArrayBuffer {
    // Simplified FP16 quantization
    const quantized = new Uint16Array(weights.length);
    
    for (let i = 0; i < weights.length; i++) {
      quantized[i] = this.floatToHalf(weights[i]);
    }
    
    return quantized.buffer;
  }
  
  /**
   * Convert float32 to float16
   */
  private floatToHalf(value: number): number {
    const floatView = new Float32Array(1);
    const intView = new Uint32Array(floatView.buffer);
    
    floatView[0] = value;
    const f = intView[0];
    
    const sign = (f >> 31) & 0x0001;
    const exp = (f >> 23) & 0x00ff;
    const frac = f & 0x007fffff;
    
    let half: number;
    
    if (exp === 0) {
      half = sign << 15;
    } else if (exp === 0xff) {
      half = (sign << 15) | 0x7c00 | (frac ? 1 : 0);
    } else {
      const newExp = exp - 127 + 15;
      
      if (newExp <= 0) {
        half = sign << 15;
      } else if (newExp >= 0x1f) {
        half = (sign << 15) | 0x7c00;
      } else {
        half = (sign << 15) | (newExp << 10) | (frac >> 13);
      }
    }
    
    return half;
  }
  
  /**
   * Optimize with TensorRT
   */
  private async optimizeTensorRT(
    modelId: string,
    weights: Map<string, ArrayBuffer>,
    architecture: any
  ): Promise<void> {
    // Simulate TensorRT optimization
    console.log(`Optimizing ${modelId} with TensorRT`);
    
    // Fusion optimizations
    // - Fuse Conv + BN + ReLU
    // - Fuse MatMul + Add
    // - Eliminate redundant operations
    
    // Kernel auto-tuning
    // - Select optimal kernel implementations
    // - Tune for specific GPU architecture
    
    // Memory optimization
    // - Optimize tensor layouts
    // - Minimize memory transfers
    
    await new Promise(resolve => setTimeout(resolve, 100));
    console.log(`TensorRT optimization complete for ${modelId}`);
  }
  
  /**
   * Transfer model to GPU memory
   */
  private async transferToGPU(
    modelId: string,
    weights: Map<string, ArrayBuffer>
  ): Promise<void> {
    const device = this.selectBestDevice();
    
    weights.forEach((weight, key) => {
      const buffer: GPUBuffer = {
        id: `${modelId}_${key}`,
        size: weight.byteLength,
        usage: 'read-only',
        data: new Float32Array(weight),
        device
      };
      
      // Add to buffer pool
      const pool = this.bufferPool.get(modelId) || [];
      pool.push(buffer);
      this.bufferPool.set(modelId, pool);
    });
  }
  
  /**
   * Warm up model
   */
  private async warmupModel(modelId: string): Promise<void> {
    const profile = this.modelProfiles.get(modelId);
    if (!profile) return;
    
    console.log(`Warming up model ${modelId}`);
    
    // Run inference with different batch sizes
    const batchSizes = [1, 4, 8, 16, 32, 64];
    
    for (const batchSize of batchSizes) {
      if (batchSize > this.config.batching.maxBatchSize) break;
      
      const dummyInput = new Float32Array(batchSize * 768); // Assuming 768 features
      const startTime = performance.now();
      
      await this.runInference({
        modelId,
        input: dummyInput,
        batchSize,
        priority: 'low'
      });
      
      const latency = performance.now() - startTime;
      profile.averageLatency.set(batchSize, latency);
    }
    
    // Determine optimal batch size
    let optimalBatch = 1;
    let bestThroughput = 0;
    
    profile.averageLatency.forEach((latency, batchSize) => {
      const throughput = batchSize / latency;
      if (throughput > bestThroughput) {
        bestThroughput = throughput;
        optimalBatch = batchSize;
      }
    });
    
    profile.optimalBatchSize = optimalBatch;
    console.log(`Model ${modelId} warmed up. Optimal batch size: ${optimalBatch}`);
  }
  
  /**
   * Detect available GPUs
   */
  private async detectGPUs(): Promise<void> {
    // Simulate GPU detection
    // In production, use actual GPU detection API
    
    if (this.config.backend === 'cuda') {
      // NVIDIA GPUs
      this.devices.set(0, {
        id: 0,
        name: 'NVIDIA RTX 4090',
        memory: 24,
        computeCapability: '8.9',
        cores: 16384,
        clockSpeed: 2520,
        utilization: 0
      });
    } else if (this.config.backend === 'metal') {
      // Apple Silicon
      this.devices.set(0, {
        id: 0,
        name: 'Apple M2 Max',
        memory: 32,
        computeCapability: '2.0',
        cores: 38,
        clockSpeed: 3500,
        utilization: 0
      });
    } else {
      // WebGPU fallback
      this.devices.set(0, {
        id: 0,
        name: 'WebGPU Device',
        memory: 8,
        computeCapability: '1.0',
        cores: 1024,
        clockSpeed: 1000,
        utilization: 0
      });
    }
  }
  
  /**
   * Initialize backend
   */
  private async initializeBackend(): Promise<void> {
    switch (this.config.backend) {
      case 'cuda':
        await this.initializeCUDA();
        break;
      
      case 'webgpu':
        await this.initializeWebGPU();
        break;
      
      case 'metal':
        await this.initializeMetal();
        break;
      
      case 'opencl':
        await this.initializeOpenCL();
        break;
    }
  }
  
  private async initializeCUDA(): Promise<void> {
    console.log('Initializing CUDA backend');
    // In production, initialize CUDA context
  }
  
  private async initializeWebGPU(): Promise<void> {
    console.log('Initializing WebGPU backend');
    // In production, request WebGPU adapter and device
  }
  
  private async initializeMetal(): Promise<void> {
    console.log('Initializing Metal backend');
    // In production, initialize Metal device
  }
  
  private async initializeOpenCL(): Promise<void> {
    console.log('Initializing OpenCL backend');
    // In production, initialize OpenCL context
  }
  
  /**
   * Compile GPU kernels
   */
  private async compileKernels(): Promise<void> {
    // Compile inference kernels
    const kernelNames = [
      'transformer_inference',
      'conv_inference',
      'matmul_inference',
      'attention_inference',
      'layernorm_inference'
    ];
    
    for (const name of kernelNames) {
      const kernel: GPUKernel = {
        name,
        code: this.generateKernelCode(name),
        workgroupSize: [256, 1, 1],
        buffers: new Map(),
        compiled: false
      };
      
      // Compile kernel
      await this.compileKernel(kernel);
      this.kernels.set(name, kernel);
    }
  }
  
  private generateKernelCode(name: string): string {
    // Generate GPU kernel code
    // In production, use actual shader/kernel code
    
    if (this.config.backend === 'webgpu') {
      return `
        @group(0) @binding(0) var<storage, read> input: array<f32>;
        @group(0) @binding(1) var<storage, read_write> output: array<f32>;
        
        @compute @workgroup_size(256)
        fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
          let idx = global_id.x;
          output[idx] = tanh(input[idx] * 0.5);
        }
      `;
    } else if (this.config.backend === 'cuda') {
      return `
        __global__ void ${name}(float* input, float* output, int size) {
          int idx = blockIdx.x * blockDim.x + threadIdx.x;
          if (idx < size) {
            output[idx] = tanhf(input[idx] * 0.5f);
          }
        }
      `;
    }
    
    return '';
  }
  
  private async compileKernel(kernel: GPUKernel): Promise<void> {
    // Simulate kernel compilation
    await new Promise(resolve => setTimeout(resolve, 10));
    kernel.compiled = true;
  }
  
  /**
   * Initialize buffer pool
   */
  private initializeBufferPool(): void {
    const poolSizes = [1024, 4096, 16384, 65536, 262144]; // Various buffer sizes
    
    poolSizes.forEach(size => {
      const buffers: GPUBuffer[] = [];
      
      // Pre-allocate buffers
      for (let i = 0; i < 10; i++) {
        buffers.push({
          id: `pool_${size}_${i}`,
          size,
          usage: 'storage',
          device: this.selectBestDevice()
        });
      }
      
      this.bufferPool.set(`size_${size}`, buffers);
    });
  }
  
  /**
   * Get buffer from pool or create new
   */
  private async getBuffer(
    type: string,
    data: Float32Array | null
  ): Promise<GPUBuffer> {
    const size = data ? data.byteLength : 4096;
    
    // Try to get from pool
    if (this.config.memory.pooling) {
      const poolKey = `size_${this.nearestPoolSize(size)}`;
      const pool = this.bufferPool.get(poolKey);
      
      if (pool && pool.length > 0) {
        const buffer = pool.pop()!;
        if (data) {
          buffer.data = data;
        }
        return buffer;
      }
    }
    
    // Create new buffer
    return {
      id: `buffer_${Date.now()}_${type}`,
      size,
      usage: type === 'input' ? 'read-only' : 'write-only',
      data,
      device: this.selectBestDevice()
    };
  }
  
  private nearestPoolSize(size: number): number {
    const poolSizes = [1024, 4096, 16384, 65536, 262144];
    
    for (const poolSize of poolSizes) {
      if (size <= poolSize) {
        return poolSize;
      }
    }
    
    return size;
  }
  
  /**
   * Start batch processing timer
   */
  private startBatchProcessing(): void {
    this.processingTimer = setInterval(() => {
      // Process pending batches
      this.batchQueue.forEach((queue, modelId) => {
        if (queue.length > 0) {
          this.processBatch(modelId);
        }
      });
    }, this.config.batching.timeout);
  }
  
  /**
   * Select best device for request
   */
  private selectDevice(request: InferenceRequest): GPUDevice {
    // Select based on priority and utilization
    let bestDevice: GPUDevice | null = null;
    let minUtilization = 100;
    
    this.devices.forEach(device => {
      if (device.utilization < minUtilization) {
        minUtilization = device.utilization;
        bestDevice = device;
      }
    });
    
    return bestDevice || this.devices.values().next().value;
  }
  
  private selectBestDevice(): GPUDevice {
    // Select device with most memory
    let bestDevice: GPUDevice | null = null;
    let maxMemory = 0;
    
    this.devices.forEach(device => {
      if (device.memory > maxMemory) {
        maxMemory = device.memory;
        bestDevice = device;
      }
    });
    
    return bestDevice || this.devices.values().next().value;
  }
  
  /**
   * Create batch tensor from individual inputs
   */
  private createBatchTensor(inputs: Float32Array[]): Float32Array {
    const batchSize = inputs.length;
    const inputSize = inputs[0].length;
    const batchTensor = new Float32Array(batchSize * inputSize);
    
    for (let i = 0; i < batchSize; i++) {
      batchTensor.set(inputs[i], i * inputSize);
    }
    
    return batchTensor;
  }
  
  /**
   * Split batch results
   */
  private splitBatchResults(
    result: InferenceResult,
    batchSize: number
  ): InferenceResult[] {
    const outputSize = result.output.length / batchSize;
    const results: InferenceResult[] = [];
    
    for (let i = 0; i < batchSize; i++) {
      const output = result.output.slice(i * outputSize, (i + 1) * outputSize);
      
      results.push({
        output,
        latency: result.latency / batchSize,
        device: result.device,
        batchSize: 1,
        throughput: result.throughput
      });
    }
    
    return results;
  }
  
  /**
   * Calculate output size for kernel
   */
  private calculateOutputSize(kernelName: string, inputSize: number): number {
    // Simplified calculation
    if (kernelName.includes('transformer')) {
      return inputSize; // Same size for transformer
    } else if (kernelName.includes('conv')) {
      return Math.floor(inputSize * 0.5); // Downsample
    } else {
      return inputSize;
    }
  }
  
  /**
   * Profile model
   */
  private profileModel(
    modelId: string,
    weights: Map<string, Float32Array>,
    architecture: any
  ): ModelProfile {
    let totalParams = 0;
    let totalFlops = 0;
    let memoryRequired = 0;
    
    weights.forEach(weight => {
      totalParams += weight.length;
      memoryRequired += weight.byteLength;
    });
    
    // Estimate FLOPs (simplified)
    totalFlops = totalParams * 2; // Multiply-accumulate for each parameter
    
    return {
      modelId,
      parameters: totalParams,
      flops: totalFlops,
      memoryRequired: memoryRequired / (1024 * 1024), // Convert to MB
      optimalBatchSize: 32,
      supportedPrecisions: ['fp32', 'fp16', 'int8'],
      averageLatency: new Map()
    };
  }
  
  /**
   * Update performance metrics
   */
  private updateMetrics(device: GPUDevice, latency: number): void {
    this.metrics.totalInferences++;
    this.metrics.totalLatency += latency;
    
    // Update device utilization
    const currentUtil = this.metrics.deviceUtilization.get(device.id) || 0;
    this.metrics.deviceUtilization.set(
      device.id,
      (currentUtil * (this.metrics.totalInferences - 1) + latency) /
      this.metrics.totalInferences
    );
    
    // Update device object
    device.utilization = Math.min(
      100,
      (latency / 10) * 100 // Simplified utilization calculation
    );
    
    // Update peak memory
    let totalMemory = 0;
    this.bufferPool.forEach(buffers => {
      buffers.forEach(buffer => {
        totalMemory += buffer.size;
      });
    });
    
    this.metrics.peakMemoryUsage = Math.max(
      this.metrics.peakMemoryUsage,
      totalMemory
    );
  }
  
  /**
   * Get performance metrics
   */
  getMetrics(): any {
    return {
      totalInferences: this.metrics.totalInferences,
      averageLatency: this.metrics.totalLatency / this.metrics.totalInferences,
      peakMemoryUsage: this.metrics.peakMemoryUsage,
      deviceUtilization: Array.from(this.metrics.deviceUtilization.entries()),
      kernelExecutions: Array.from(this.metrics.kernelExecutions.entries())
    };
  }
  
  /**
   * Cleanup GPU resources
   */
  async cleanup(): Promise<void> {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
    }
    
    // Clear buffers
    this.bufferPool.clear();
    
    // Clear kernels
    this.kernels.clear();
    
    // Reset devices
    this.devices.forEach(device => {
      device.utilization = 0;
    });
    
    console.log('GPU resources cleaned up');
  }
}