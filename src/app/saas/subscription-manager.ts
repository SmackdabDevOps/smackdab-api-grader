/**
 * Subscription Manager
 * Handles subscription lifecycle, pricing, trials, and entitlements
 * Supports complex pricing models and usage-based billing
 */

export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: 'free' | 'starter' | 'professional' | 'enterprise' | 'custom';
  pricing: {
    model: 'flat' | 'usage' | 'tiered' | 'per-unit' | 'hybrid';
    currency: string;
    interval: 'monthly' | 'yearly' | 'custom';
    amount: number;
    setupFee?: number;
    discount?: {
      type: 'percentage' | 'fixed';
      value: number;
      conditions?: string;
    };
  };
  features: Map<string, FeatureEntitlement>;
  limits: {
    apis: number;
    users: number;
    requests: number;
    storage: number;
    compute: number;
  };
  trial: {
    enabled: boolean;
    duration: number; // days
    features: string[];
    creditCard: boolean;
  };
  addons: string[];
  metadata: {
    popular?: boolean;
    recommended?: boolean;
    description: string;
    highlights: string[];
  };
}

export interface FeatureEntitlement {
  name: string;
  enabled: boolean;
  limit?: number;
  unit?: string;
  overage?: {
    allowed: boolean;
    rate: number;
    hardLimit?: number;
  };
}

export interface Subscription {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  billing: {
    customerId: string;
    paymentMethodId?: string;
    currency: string;
    taxRate: number;
    billingAddress?: Address;
  };
  period: {
    start: Date;
    end: Date;
    trial?: {
      start: Date;
      end: Date;
      converting: boolean;
    };
  };
  usage: Map<string, UsageRecord>;
  invoices: Invoice[];
  changes: SubscriptionChange[];
  renewal: {
    auto: boolean;
    nextDate: Date;
    retryCount: number;
  };
  cancellation?: {
    date: Date;
    reason: string;
    feedback?: string;
    effectiveDate: Date;
  };
}

export type SubscriptionStatus = 
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export interface UsageRecord {
  metric: string;
  quantity: number;
  unit: string;
  timestamp: Date;
  metadata?: any;
}

export interface Invoice {
  id: string;
  subscriptionId: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  period: {
    start: Date;
    end: Date;
  };
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
  currency: string;
  dueDate: Date;
  paidAt?: Date;
  paymentMethod?: string;
  attempts: number;
  url?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  type: 'subscription' | 'usage' | 'addon' | 'discount' | 'tax';
  metadata?: any;
}

export interface SubscriptionChange {
  id: string;
  type: 'upgrade' | 'downgrade' | 'addon' | 'removal' | 'pause' | 'resume';
  from: string;
  to: string;
  timestamp: Date;
  effective: Date;
  prorated: boolean;
  amount?: number;
  reason?: string;
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank' | 'paypal' | 'invoice' | 'crypto';
  details: any;
  isDefault: boolean;
  verified: boolean;
}

export interface Addon {
  id: string;
  name: string;
  description: string;
  pricing: {
    model: 'flat' | 'usage';
    amount: number;
    interval?: string;
  };
  features: string[];
  compatible: string[]; // plan IDs
}

export class SubscriptionManager {
  private plans: Map<string, SubscriptionPlan> = new Map();
  private subscriptions: Map<string, Subscription> = new Map();
  private addons: Map<string, Addon> = new Map();
  private paymentProcessor: PaymentProcessor;
  private usageTracker: UsageTracker;
  private invoiceGenerator: InvoiceGenerator;
  private notificationService: NotificationService;
  
  constructor(private config: {
    stripeKey?: string;
    taxService?: string;
    webhookSecret?: string;
    gracePeriod?: number;
    dunningAttempts?: number;
  }) {
    this.paymentProcessor = new PaymentProcessor(config);
    this.usageTracker = new UsageTracker();
    this.invoiceGenerator = new InvoiceGenerator();
    this.notificationService = new NotificationService();
    
    this.initialize();
  }
  
  /**
   * Initialize subscription manager
   */
  private async initialize(): Promise<void> {
    // Load plans
    await this.loadPlans();
    
    // Load addons
    await this.loadAddons();
    
    // Start billing cycle checker
    this.startBillingCycle();
    
    // Start usage aggregation
    this.startUsageAggregation();
    
    // Start dunning process
    this.startDunningProcess();
    
    console.log('Subscription manager initialized');
  }
  
  /**
   * Create subscription
   */
  async createSubscription(
    tenantId: string,
    planId: string,
    options: {
      paymentMethodId?: string;
      trial?: boolean;
      addons?: string[];
      metadata?: any;
    } = {}
  ): Promise<Subscription> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }
    
    // Check if tenant already has subscription
    const existing = this.getSubscriptionByTenant(tenantId);
    if (existing) {
      throw new Error(`Tenant ${tenantId} already has subscription`);
    }
    
    // Create customer if needed
    const customerId = await this.paymentProcessor.createCustomer(tenantId);
    
    // Add payment method if provided
    if (options.paymentMethodId) {
      await this.paymentProcessor.attachPaymentMethod(
        customerId,
        options.paymentMethodId
      );
    }
    
    // Calculate dates
    const now = new Date();
    const trial = options.trial && plan.trial.enabled;
    
    const subscription: Subscription = {
      id: this.generateSubscriptionId(),
      tenantId,
      planId,
      status: trial ? 'trialing' : 'active',
      billing: {
        customerId,
        paymentMethodId: options.paymentMethodId,
        currency: plan.pricing.currency,
        taxRate: await this.calculateTaxRate(tenantId)
      },
      period: {
        start: now,
        end: this.calculatePeriodEnd(now, plan.pricing.interval),
        trial: trial ? {
          start: now,
          end: this.addDays(now, plan.trial.duration),
          converting: false
        } : undefined
      },
      usage: new Map(),
      invoices: [],
      changes: [],
      renewal: {
        auto: true,
        nextDate: this.calculatePeriodEnd(now, plan.pricing.interval),
        retryCount: 0
      }
    };
    
    // Store subscription
    this.subscriptions.set(subscription.id, subscription);
    
    // Create initial invoice if not trial
    if (!trial && plan.pricing.amount > 0) {
      await this.createInvoice(subscription);
    }
    
    // Send welcome email
    await this.notificationService.sendSubscriptionWelcome(subscription);
    
    // Track event
    await this.trackEvent('subscription_created', {
      subscriptionId: subscription.id,
      planId,
      trial
    });
    
    return subscription;
  }
  
  /**
   * Update subscription
   */
  async updateSubscription(
    subscriptionId: string,
    updates: {
      planId?: string;
      addons?: string[];
      paymentMethodId?: string;
      autoRenew?: boolean;
    }
  ): Promise<Subscription> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    // Handle plan change
    if (updates.planId && updates.planId !== subscription.planId) {
      await this.changePlan(subscription, updates.planId);
    }
    
    // Update payment method
    if (updates.paymentMethodId) {
      await this.updatePaymentMethod(subscription, updates.paymentMethodId);
    }
    
    // Update auto-renewal
    if (updates.autoRenew !== undefined) {
      subscription.renewal.auto = updates.autoRenew;
    }
    
    // Track changes
    await this.trackEvent('subscription_updated', {
      subscriptionId,
      updates
    });
    
    return subscription;
  }
  
  /**
   * Cancel subscription
   */
  async cancelSubscription(
    subscriptionId: string,
    options: {
      immediate?: boolean;
      reason?: string;
      feedback?: string;
    } = {}
  ): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    const now = new Date();
    
    subscription.cancellation = {
      date: now,
      reason: options.reason || 'customer_request',
      feedback: options.feedback,
      effectiveDate: options.immediate ? now : subscription.period.end
    };
    
    if (options.immediate) {
      subscription.status = 'canceled';
      
      // Refund if applicable
      await this.processRefund(subscription);
    } else {
      // Cancel at end of period
      subscription.renewal.auto = false;
    }
    
    // Send cancellation email
    await this.notificationService.sendCancellationConfirmation(subscription);
    
    // Track event
    await this.trackEvent('subscription_canceled', {
      subscriptionId,
      immediate: options.immediate,
      reason: options.reason
    });
  }
  
  /**
   * Pause subscription
   */
  async pauseSubscription(
    subscriptionId: string,
    duration?: number // days
  ): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    if (subscription.status === 'paused') {
      throw new Error('Subscription already paused');
    }
    
    subscription.status = 'paused';
    
    // Extend period by pause duration
    if (duration) {
      subscription.period.end = this.addDays(subscription.period.end, duration);
      subscription.renewal.nextDate = this.addDays(subscription.renewal.nextDate, duration);
    }
    
    // Track event
    await this.trackEvent('subscription_paused', {
      subscriptionId,
      duration
    });
  }
  
  /**
   * Resume subscription
   */
  async resumeSubscription(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    if (subscription.status !== 'paused') {
      throw new Error('Subscription not paused');
    }
    
    subscription.status = 'active';
    
    // Track event
    await this.trackEvent('subscription_resumed', {
      subscriptionId
    });
  }
  
  /**
   * Record usage
   */
  async recordUsage(
    subscriptionId: string,
    metric: string,
    quantity: number,
    metadata?: any
  ): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    const usage: UsageRecord = {
      metric,
      quantity,
      unit: this.getMetricUnit(metric),
      timestamp: new Date(),
      metadata
    };
    
    // Add to subscription usage
    const key = `${metric}_${Date.now()}`;
    subscription.usage.set(key, usage);
    
    // Check for overage
    await this.checkOverage(subscription, metric, quantity);
    
    // Track in usage tracker
    await this.usageTracker.record(subscriptionId, usage);
  }
  
  /**
   * Get subscription usage
   */
  async getUsage(
    subscriptionId: string,
    period?: { start: Date; end: Date }
  ): Promise<Map<string, number>> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    return this.usageTracker.aggregate(subscriptionId, period);
  }
  
  /**
   * Create invoice
   */
  async createInvoice(
    subscription: Subscription,
    options: {
      draft?: boolean;
      items?: InvoiceItem[];
    } = {}
  ): Promise<Invoice> {
    const plan = this.plans.get(subscription.planId);
    if (!plan) {
      throw new Error(`Plan ${subscription.planId} not found`);
    }
    
    // Calculate invoice items
    const items: InvoiceItem[] = options.items || [];
    
    // Add subscription charge
    items.push({
      description: `${plan.name} subscription`,
      quantity: 1,
      unitPrice: plan.pricing.amount,
      amount: plan.pricing.amount,
      type: 'subscription'
    });
    
    // Add usage charges
    const usageCharges = await this.calculateUsageCharges(subscription);
    items.push(...usageCharges);
    
    // Calculate totals
    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const tax = subtotal * subscription.billing.taxRate;
    const total = subtotal + tax;
    
    const invoice: Invoice = {
      id: this.generateInvoiceId(),
      subscriptionId: subscription.id,
      status: options.draft ? 'draft' : 'open',
      period: {
        start: subscription.period.start,
        end: subscription.period.end
      },
      items,
      subtotal,
      tax,
      total,
      currency: subscription.billing.currency,
      dueDate: this.addDays(new Date(), 7),
      attempts: 0
    };
    
    // Store invoice
    subscription.invoices.push(invoice);
    
    // Process payment if not draft
    if (!options.draft && subscription.billing.paymentMethodId) {
      await this.processPayment(invoice, subscription);
    }
    
    // Send invoice email
    await this.notificationService.sendInvoice(invoice, subscription);
    
    return invoice;
  }
  
  /**
   * Process payment
   */
  async processPayment(
    invoice: Invoice,
    subscription: Subscription
  ): Promise<void> {
    try {
      const payment = await this.paymentProcessor.charge(
        subscription.billing.customerId,
        invoice.total,
        invoice.currency,
        {
          invoiceId: invoice.id,
          subscriptionId: subscription.id
        }
      );
      
      if (payment.status === 'succeeded') {
        invoice.status = 'paid';
        invoice.paidAt = new Date();
        invoice.paymentMethod = payment.paymentMethod;
        
        // Reset retry count
        subscription.renewal.retryCount = 0;
        
        // Update subscription status
        if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
          subscription.status = 'active';
        }
        
        // Send receipt
        await this.notificationService.sendReceipt(invoice, subscription);
      } else {
        throw new Error(`Payment failed: ${payment.error}`);
      }
    } catch (error) {
      invoice.attempts++;
      
      // Update subscription status
      if (invoice.attempts >= (this.config.dunningAttempts || 3)) {
        subscription.status = 'unpaid';
      } else {
        subscription.status = 'past_due';
      }
      
      // Schedule retry
      await this.schedulePaymentRetry(invoice, subscription);
      
      throw error;
    }
  }
  
  /**
   * Add addon to subscription
   */
  async addAddon(
    subscriptionId: string,
    addonId: string
  ): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    const addon = this.addons.get(addonId);
    if (!addon) {
      throw new Error(`Addon ${addonId} not found`);
    }
    
    // Check compatibility
    if (!addon.compatible.includes(subscription.planId)) {
      throw new Error(`Addon ${addonId} not compatible with plan ${subscription.planId}`);
    }
    
    // Add addon
    subscription.changes.push({
      id: this.generateChangeId(),
      type: 'addon',
      from: '',
      to: addonId,
      timestamp: new Date(),
      effective: new Date(),
      prorated: true
    });
    
    // Calculate prorated charge
    const proratedAmount = await this.calculateProration(
      addon.pricing.amount,
      subscription
    );
    
    // Create invoice for addon
    await this.createInvoice(subscription, {
      items: [{
        description: `${addon.name} addon (prorated)`,
        quantity: 1,
        unitPrice: proratedAmount,
        amount: proratedAmount,
        type: 'addon'
      }]
    });
  }
  
  /**
   * Get available plans
   */
  getPlans(): SubscriptionPlan[] {
    return Array.from(this.plans.values());
  }
  
  /**
   * Get subscription
   */
  getSubscription(subscriptionId: string): Subscription | undefined {
    return this.subscriptions.get(subscriptionId);
  }
  
  /**
   * Get subscription by tenant
   */
  getSubscriptionByTenant(tenantId: string): Subscription | undefined {
    return Array.from(this.subscriptions.values()).find(
      s => s.tenantId === tenantId
    );
  }
  
  /**
   * Check entitlement
   */
  async checkEntitlement(
    subscriptionId: string,
    feature: string
  ): Promise<{
    allowed: boolean;
    limit?: number;
    used?: number;
    remaining?: number;
  }> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }
    
    const plan = this.plans.get(subscription.planId);
    if (!plan) {
      throw new Error(`Plan ${subscription.planId} not found`);
    }
    
    const entitlement = plan.features.get(feature);
    if (!entitlement || !entitlement.enabled) {
      return { allowed: false };
    }
    
    if (entitlement.limit) {
      const used = await this.getFeatureUsage(subscriptionId, feature);
      return {
        allowed: used < entitlement.limit,
        limit: entitlement.limit,
        used,
        remaining: entitlement.limit - used
      };
    }
    
    return { allowed: true };
  }
  
  // Private helper methods
  
  private async loadPlans(): Promise<void> {
    // Load subscription plans
    const plans: SubscriptionPlan[] = [
      {
        id: 'free',
        name: 'Free',
        tier: 'free',
        pricing: {
          model: 'flat',
          currency: 'USD',
          interval: 'monthly',
          amount: 0
        },
        features: new Map([
          ['api_grading', { name: 'API Grading', enabled: true, limit: 3 }],
          ['basic_reports', { name: 'Basic Reports', enabled: true }]
        ]),
        limits: {
          apis: 3,
          users: 1,
          requests: 1000,
          storage: 100,
          compute: 10
        },
        trial: {
          enabled: false,
          duration: 0,
          features: [],
          creditCard: false
        },
        addons: [],
        metadata: {
          description: 'Perfect for trying out API Grader',
          highlights: ['3 APIs', 'Basic reports', '1,000 requests/month']
        }
      },
      {
        id: 'professional',
        name: 'Professional',
        tier: 'professional',
        pricing: {
          model: 'flat',
          currency: 'USD',
          interval: 'monthly',
          amount: 299
        },
        features: new Map([
          ['api_grading', { name: 'API Grading', enabled: true, limit: 100 }],
          ['advanced_reports', { name: 'Advanced Reports', enabled: true }],
          ['team_collaboration', { name: 'Team Collaboration', enabled: true }]
        ]),
        limits: {
          apis: 100,
          users: 10,
          requests: 100000,
          storage: 1000,
          compute: 1000
        },
        trial: {
          enabled: true,
          duration: 14,
          features: ['all'],
          creditCard: true
        },
        addons: ['extra_storage', 'priority_support'],
        metadata: {
          popular: true,
          description: 'For growing teams',
          highlights: ['100 APIs', 'Advanced analytics', 'Team features']
        }
      },
      {
        id: 'enterprise',
        name: 'Enterprise',
        tier: 'enterprise',
        pricing: {
          model: 'custom',
          currency: 'USD',
          interval: 'yearly',
          amount: -1
        },
        features: new Map([
          ['api_grading', { name: 'API Grading', enabled: true }],
          ['enterprise_reports', { name: 'Enterprise Reports', enabled: true }],
          ['sso', { name: 'Single Sign-On', enabled: true }],
          ['dedicated_support', { name: 'Dedicated Support', enabled: true }]
        ]),
        limits: {
          apis: -1,
          users: -1,
          requests: -1,
          storage: -1,
          compute: -1
        },
        trial: {
          enabled: true,
          duration: 30,
          features: ['all'],
          creditCard: false
        },
        addons: ['white_label', 'custom_integration'],
        metadata: {
          description: 'Custom solution for enterprises',
          highlights: ['Unlimited everything', 'SLA', 'Dedicated support']
        }
      }
    ];
    
    plans.forEach(plan => this.plans.set(plan.id, plan));
  }
  
  private async loadAddons(): Promise<void> {
    const addons: Addon[] = [
      {
        id: 'extra_storage',
        name: 'Extra Storage',
        description: '100GB additional storage',
        pricing: {
          model: 'flat',
          amount: 50
        },
        features: ['100GB storage'],
        compatible: ['professional', 'enterprise']
      },
      {
        id: 'priority_support',
        name: 'Priority Support',
        description: '24/7 priority support',
        pricing: {
          model: 'flat',
          amount: 99
        },
        features: ['24/7 support', '1 hour response time'],
        compatible: ['professional']
      }
    ];
    
    addons.forEach(addon => this.addons.set(addon.id, addon));
  }
  
  private startBillingCycle(): void {
    setInterval(async () => {
      await this.processBillingCycle();
    }, 3600000); // Every hour
  }
  
  private startUsageAggregation(): void {
    setInterval(async () => {
      await this.aggregateUsage();
    }, 900000); // Every 15 minutes
  }
  
  private startDunningProcess(): void {
    setInterval(async () => {
      await this.processDunning();
    }, 86400000); // Every day
  }
  
  private async processBillingCycle(): Promise<void> {
    const now = new Date();
    
    for (const subscription of this.subscriptions.values()) {
      // Check for period end
      if (subscription.period.end <= now && subscription.renewal.auto) {
        await this.renewSubscription(subscription);
      }
      
      // Check for trial end
      if (subscription.period.trial && subscription.period.trial.end <= now) {
        await this.convertTrial(subscription);
      }
    }
  }
  
  private async renewSubscription(subscription: Subscription): Promise<void> {
    const plan = this.plans.get(subscription.planId);
    if (!plan) return;
    
    // Update period
    subscription.period.start = subscription.period.end;
    subscription.period.end = this.calculatePeriodEnd(
      subscription.period.start,
      plan.pricing.interval
    );
    
    // Create renewal invoice
    await this.createInvoice(subscription);
    
    // Update renewal date
    subscription.renewal.nextDate = subscription.period.end;
  }
  
  private async convertTrial(subscription: Subscription): Promise<void> {
    if (!subscription.period.trial) return;
    
    subscription.period.trial.converting = true;
    
    // Check for payment method
    if (!subscription.billing.paymentMethodId) {
      // Send payment method required email
      await this.notificationService.sendPaymentMethodRequired(subscription);
      subscription.status = 'incomplete';
      return;
    }
    
    // Convert to paid
    subscription.status = 'active';
    delete subscription.period.trial;
    
    // Create first invoice
    await this.createInvoice(subscription);
  }
  
  private async aggregateUsage(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      await this.usageTracker.aggregate(subscription.id);
    }
  }
  
  private async processDunning(): Promise<void> {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.status === 'past_due') {
        await this.attemptPaymentRetry(subscription);
      }
    }
  }
  
  private async attemptPaymentRetry(subscription: Subscription): Promise<void> {
    const unpaidInvoices = subscription.invoices.filter(
      i => i.status === 'open' && i.attempts > 0
    );
    
    for (const invoice of unpaidInvoices) {
      subscription.renewal.retryCount++;
      
      if (subscription.renewal.retryCount > (this.config.dunningAttempts || 3)) {
        subscription.status = 'unpaid';
        await this.notificationService.sendSubscriptionSuspended(subscription);
      } else {
        await this.processPayment(invoice, subscription);
      }
    }
  }
  
  private async changePlan(
    subscription: Subscription,
    newPlanId: string
  ): Promise<void> {
    const oldPlan = this.plans.get(subscription.planId);
    const newPlan = this.plans.get(newPlanId);
    
    if (!oldPlan || !newPlan) {
      throw new Error('Invalid plan');
    }
    
    const changeType = newPlan.pricing.amount > oldPlan.pricing.amount ? 
      'upgrade' : 'downgrade';
    
    subscription.changes.push({
      id: this.generateChangeId(),
      type: changeType,
      from: subscription.planId,
      to: newPlanId,
      timestamp: new Date(),
      effective: changeType === 'upgrade' ? new Date() : subscription.period.end,
      prorated: changeType === 'upgrade'
    });
    
    if (changeType === 'upgrade') {
      // Calculate prorated charge
      const proratedAmount = await this.calculateProration(
        newPlan.pricing.amount - oldPlan.pricing.amount,
        subscription
      );
      
      // Create invoice for prorated amount
      await this.createInvoice(subscription, {
        items: [{
          description: `Plan ${changeType} (prorated)`,
          quantity: 1,
          unitPrice: proratedAmount,
          amount: proratedAmount,
          type: 'subscription'
        }]
      });
      
      subscription.planId = newPlanId;
    }
  }
  
  private async updatePaymentMethod(
    subscription: Subscription,
    paymentMethodId: string
  ): Promise<void> {
    await this.paymentProcessor.attachPaymentMethod(
      subscription.billing.customerId,
      paymentMethodId
    );
    
    subscription.billing.paymentMethodId = paymentMethodId;
  }
  
  private async processRefund(subscription: Subscription): Promise<void> {
    const lastPaidInvoice = subscription.invoices
      .filter(i => i.status === 'paid')
      .sort((a, b) => b.paidAt!.getTime() - a.paidAt!.getTime())[0];
    
    if (lastPaidInvoice) {
      const refundAmount = this.calculateRefundAmount(
        lastPaidInvoice,
        subscription
      );
      
      if (refundAmount > 0) {
        await this.paymentProcessor.refund(
          lastPaidInvoice.id,
          refundAmount
        );
      }
    }
  }
  
  private async checkOverage(
    subscription: Subscription,
    metric: string,
    quantity: number
  ): Promise<void> {
    const plan = this.plans.get(subscription.planId);
    if (!plan) return;
    
    const feature = plan.features.get(metric);
    if (!feature || !feature.limit) return;
    
    const used = await this.getFeatureUsage(subscription.id, metric);
    
    if (used + quantity > feature.limit) {
      if (feature.overage?.allowed) {
        // Calculate overage charge
        const overageAmount = (used + quantity - feature.limit) * feature.overage.rate;
        
        // Add to next invoice
        // Implementation here
      } else {
        throw new Error(`${metric} limit exceeded`);
      }
    }
  }
  
  private async calculateUsageCharges(subscription: Subscription): Promise<InvoiceItem[]> {
    const items: InvoiceItem[] = [];
    const usage = await this.usageTracker.aggregate(subscription.id);
    
    // Calculate usage-based charges
    usage.forEach((quantity, metric) => {
      const rate = this.getUsageRate(subscription.planId, metric);
      if (rate > 0) {
        items.push({
          description: `${metric} usage`,
          quantity,
          unitPrice: rate,
          amount: quantity * rate,
          type: 'usage'
        });
      }
    });
    
    return items;
  }
  
  private async calculateTaxRate(tenantId: string): Promise<number> {
    // Simplified tax calculation
    return 0.1; // 10% tax
  }
  
  private calculatePeriodEnd(start: Date, interval: string): Date {
    const end = new Date(start);
    
    switch (interval) {
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'yearly':
        end.setFullYear(end.getFullYear() + 1);
        break;
    }
    
    return end;
  }
  
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  
  private async calculateProration(
    amount: number,
    subscription: Subscription
  ): Promise<number> {
    const now = new Date();
    const periodStart = subscription.period.start;
    const periodEnd = subscription.period.end;
    
    const totalDays = Math.floor((periodEnd.getTime() - periodStart.getTime()) / 86400000);
    const remainingDays = Math.floor((periodEnd.getTime() - now.getTime()) / 86400000);
    
    return (amount * remainingDays) / totalDays;
  }
  
  private calculateRefundAmount(
    invoice: Invoice,
    subscription: Subscription
  ): number {
    const now = new Date();
    const periodEnd = subscription.period.end;
    
    const remainingDays = Math.floor((periodEnd.getTime() - now.getTime()) / 86400000);
    const totalDays = 30; // Simplified
    
    return (invoice.total * remainingDays) / totalDays;
  }
  
  private async schedulePaymentRetry(
    invoice: Invoice,
    subscription: Subscription
  ): Promise<void> {
    // Schedule retry based on attempt number
    const retryDelays = [1, 3, 5, 7]; // days
    const delay = retryDelays[Math.min(invoice.attempts - 1, retryDelays.length - 1)];
    
    setTimeout(async () => {
      await this.processPayment(invoice, subscription);
    }, delay * 86400000);
  }
  
  private async getFeatureUsage(
    subscriptionId: string,
    feature: string
  ): Promise<number> {
    const usage = await this.usageTracker.getFeatureUsage(subscriptionId, feature);
    return usage || 0;
  }
  
  private getUsageRate(planId: string, metric: string): number {
    // Get usage rate for metric
    return 0.01; // Simplified
  }
  
  private getMetricUnit(metric: string): string {
    const units: Record<string, string> = {
      api_calls: 'calls',
      storage: 'GB',
      compute: 'hours',
      bandwidth: 'GB'
    };
    
    return units[metric] || 'units';
  }
  
  private async trackEvent(event: string, data: any): Promise<void> {
    console.log(`Event: ${event}`, data);
  }
  
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateInvoiceId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateChangeId(): string {
    return `chg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting classes

class PaymentProcessor {
  constructor(private config: any) {}
  
  async createCustomer(tenantId: string): Promise<string> {
    return `cus_${tenantId}`;
  }
  
  async attachPaymentMethod(customerId: string, paymentMethodId: string): Promise<void> {
    console.log(`Attaching payment method ${paymentMethodId} to ${customerId}`);
  }
  
  async charge(
    customerId: string,
    amount: number,
    currency: string,
    metadata: any
  ): Promise<any> {
    return {
      status: 'succeeded',
      paymentMethod: 'card_xxxx'
    };
  }
  
  async refund(invoiceId: string, amount: number): Promise<void> {
    console.log(`Refunding ${amount} for invoice ${invoiceId}`);
  }
}

class UsageTracker {
  private usage: Map<string, Map<string, number>> = new Map();
  
  async record(subscriptionId: string, usage: UsageRecord): Promise<void> {
    if (!this.usage.has(subscriptionId)) {
      this.usage.set(subscriptionId, new Map());
    }
    
    const current = this.usage.get(subscriptionId)!.get(usage.metric) || 0;
    this.usage.get(subscriptionId)!.set(usage.metric, current + usage.quantity);
  }
  
  async aggregate(
    subscriptionId: string,
    period?: { start: Date; end: Date }
  ): Promise<Map<string, number>> {
    return this.usage.get(subscriptionId) || new Map();
  }
  
  async getFeatureUsage(subscriptionId: string, feature: string): Promise<number> {
    return this.usage.get(subscriptionId)?.get(feature) || 0;
  }
}

class InvoiceGenerator {
  async generate(subscription: Subscription): Promise<Invoice> {
    // Invoice generation logic
    return {} as Invoice;
  }
}

class NotificationService {
  async sendSubscriptionWelcome(subscription: Subscription): Promise<void> {
    console.log(`Sending welcome email for subscription ${subscription.id}`);
  }
  
  async sendCancellationConfirmation(subscription: Subscription): Promise<void> {
    console.log(`Sending cancellation confirmation for subscription ${subscription.id}`);
  }
  
  async sendInvoice(invoice: Invoice, subscription: Subscription): Promise<void> {
    console.log(`Sending invoice ${invoice.id}`);
  }
  
  async sendReceipt(invoice: Invoice, subscription: Subscription): Promise<void> {
    console.log(`Sending receipt for invoice ${invoice.id}`);
  }
  
  async sendPaymentMethodRequired(subscription: Subscription): Promise<void> {
    console.log(`Sending payment method required for subscription ${subscription.id}`);
  }
  
  async sendSubscriptionSuspended(subscription: Subscription): Promise<void> {
    console.log(`Sending suspension notice for subscription ${subscription.id}`);
  }
}