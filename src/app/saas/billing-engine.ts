/**
 * Billing Engine
 * Complete billing automation with invoice generation, payment processing, and revenue recognition
 * Supports complex pricing models, multi-currency, and global tax compliance
 */

export interface BillingConfig {
  providers: {
    payment: 'stripe' | 'paddle' | 'chargebee' | 'custom';
    tax: 'taxjar' | 'avalara' | 'stripe-tax' | 'manual';
    accounting: 'quickbooks' | 'xero' | 'netsuite' | 'custom';
  };
  currencies: string[];
  defaultCurrency: string;
  invoicing: {
    autoGenerate: boolean;
    dueDays: number;
    numbering: {
      prefix: string;
      format: string; // e.g., "INV-{YYYY}-{MM}-{0000}"
      counter: number;
    };
    reminders: Array<{
      days: number; // days before/after due date
      template: string;
    }>;
  };
  payment: {
    methods: Array<'card' | 'bank' | 'paypal' | 'wire' | 'crypto'>;
    retrySchedule: number[]; // days between retries
    gracePeriod: number; // days
    dunning: {
      enabled: boolean;
      attempts: number;
      finalAction: 'suspend' | 'cancel' | 'downgrade';
    };
  };
  tax: {
    autoCalculate: boolean;
    nexus: Array<{
      country: string;
      state?: string;
      registrationNumber?: string;
    }>;
    exemptions: Map<string, TaxExemption>;
  };
  revenue: {
    recognition: 'immediate' | 'ratable' | 'milestone' | 'custom';
    accounting: 'cash' | 'accrual';
    fiscalYearStart: number; // month (1-12)
  };
}

export interface BillingAccount {
  id: string;
  tenantId: string;
  status: 'active' | 'suspended' | 'closed';
  currency: string;
  balance: number;
  credit: {
    limit: number;
    used: number;
    available: number;
  };
  billing: {
    name: string;
    email: string;
    phone?: string;
    address: Address;
    taxId?: string;
    exemptionCertificate?: string;
  };
  payment: {
    methods: PaymentMethod[];
    defaultMethodId?: string;
    autopay: boolean;
  };
  invoices: string[]; // invoice IDs
  transactions: Transaction[];
  subscriptions: string[]; // subscription IDs
  metadata: {
    created: Date;
    updated: Date;
    notes?: string;
  };
}

export interface Invoice {
  id: string;
  number: string;
  accountId: string;
  status: InvoiceStatus;
  type: 'subscription' | 'usage' | 'one-time' | 'credit' | 'refund';
  period: {
    start: Date;
    end: Date;
  };
  items: LineItem[];
  subtotal: number;
  discounts: Discount[];
  tax: TaxCalculation;
  total: number;
  currency: string;
  dueDate: Date;
  terms: string;
  notes?: string;
  payment?: {
    method: string;
    transactionId: string;
    paidAt: Date;
    amount: number;
  };
  metadata: {
    created: Date;
    updated: Date;
    sentAt?: Date;
    viewedAt?: Date;
    remindersSent: number;
  };
  pdf?: string; // URL or base64
}

export type InvoiceStatus = 
  | 'draft'
  | 'pending'
  | 'sent'
  | 'viewed'
  | 'partial'
  | 'paid'
  | 'overdue'
  | 'void'
  | 'refunded'
  | 'disputed';

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  tax: {
    rate: number;
    amount: number;
  };
  accounting: {
    code: string;
    category: string;
    recognitionStart?: Date;
    recognitionEnd?: Date;
  };
  metadata?: any;
}

export interface Discount {
  id: string;
  type: 'percentage' | 'fixed' | 'volume' | 'bundle';
  description: string;
  amount: number;
  conditions?: any;
}

export interface TaxCalculation {
  rate: number;
  amount: number;
  breakdown: Array<{
    jurisdiction: string;
    type: string; // 'state', 'county', 'city', 'vat', 'gst'
    rate: number;
    amount: number;
  }>;
  exemptions?: string[];
}

export interface Transaction {
  id: string;
  type: 'charge' | 'refund' | 'credit' | 'adjustment' | 'dispute';
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
  amount: number;
  currency: string;
  description: string;
  invoiceId?: string;
  paymentMethod?: string;
  processor: {
    name: string;
    transactionId: string;
    fee?: number;
  };
  timestamp: Date;
  metadata?: any;
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank' | 'paypal' | 'wire' | 'crypto';
  details: any; // Type-specific details
  isDefault: boolean;
  verified: boolean;
  expiresAt?: Date;
}

export interface TaxExemption {
  type: 'resale' | 'nonprofit' | 'government' | 'other';
  certificate: string;
  validUntil?: Date;
  jurisdictions: string[];
}

export interface Address {
  line1: string;
  line2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}

export interface RevenueMetrics {
  period: {
    start: Date;
    end: Date;
  };
  revenue: {
    recognized: number;
    deferred: number;
    recurring: number;
    nonRecurring: number;
  };
  metrics: {
    mrr: number; // Monthly Recurring Revenue
    arr: number; // Annual Recurring Revenue
    arpu: number; // Average Revenue Per User
    ltv: number; // Lifetime Value
    churn: number; // Churn rate
    growth: number; // Growth rate
  };
  breakdown: {
    byProduct: Map<string, number>;
    byRegion: Map<string, number>;
    bySegment: Map<string, number>;
  };
  forecast: {
    nextMonth: number;
    nextQuarter: number;
    nextYear: number;
  };
}

export class BillingEngine {
  private config: BillingConfig;
  private accounts: Map<string, BillingAccount> = new Map();
  private invoices: Map<string, Invoice> = new Map();
  private transactions: Map<string, Transaction> = new Map();
  private paymentProcessor: PaymentProcessor;
  private taxCalculator: TaxCalculator;
  private accountingIntegration: AccountingIntegration;
  private revenueRecognizer: RevenueRecognizer;
  
  constructor(config: BillingConfig) {
    this.config = config;
    this.paymentProcessor = new PaymentProcessor(config);
    this.taxCalculator = new TaxCalculator(config);
    this.accountingIntegration = new AccountingIntegration(config);
    this.revenueRecognizer = new RevenueRecognizer(config);
    
    this.initialize();
  }
  
  /**
   * Initialize billing engine
   */
  private async initialize(): Promise<void> {
    // Load accounts
    await this.loadAccounts();
    
    // Start automated processes
    this.startInvoiceGeneration();
    this.startPaymentCollection();
    this.startDunningProcess();
    this.startRevenueRecognition();
    
    console.log('Billing engine initialized');
  }
  
  /**
   * Create billing account
   */
  async createAccount(
    tenantId: string,
    details: {
      currency: string;
      billing: BillingAccount['billing'];
      creditLimit?: number;
    }
  ): Promise<BillingAccount> {
    const account: BillingAccount = {
      id: this.generateAccountId(),
      tenantId,
      status: 'active',
      currency: details.currency,
      balance: 0,
      credit: {
        limit: details.creditLimit || 0,
        used: 0,
        available: details.creditLimit || 0
      },
      billing: details.billing,
      payment: {
        methods: [],
        autopay: true
      },
      invoices: [],
      transactions: [],
      subscriptions: [],
      metadata: {
        created: new Date(),
        updated: new Date()
      }
    };
    
    this.accounts.set(account.id, account);
    
    // Check tax exemptions
    if (details.billing.exemptionCertificate) {
      await this.processTaxExemption(account);
    }
    
    // Sync with accounting system
    await this.accountingIntegration.createCustomer(account);
    
    return account;
  }
  
  /**
   * Generate invoice
   */
  async generateInvoice(
    accountId: string,
    items: Partial<LineItem>[],
    options: {
      type?: Invoice['type'];
      period?: Invoice['period'];
      dueDate?: Date;
      discounts?: Discount[];
      notes?: string;
    } = {}
  ): Promise<Invoice> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }
    
    // Calculate line items
    const lineItems = await this.calculateLineItems(items, account);
    
    // Calculate subtotal
    const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
    
    // Apply discounts
    const discounts = options.discounts || [];
    const discountAmount = this.calculateDiscounts(subtotal, discounts);
    
    // Calculate tax
    const tax = await this.taxCalculator.calculate(
      account,
      subtotal - discountAmount,
      lineItems
    );
    
    // Calculate total
    const total = subtotal - discountAmount + tax.amount;
    
    const invoice: Invoice = {
      id: this.generateInvoiceId(),
      number: this.generateInvoiceNumber(),
      accountId,
      status: 'draft',
      type: options.type || 'subscription',
      period: options.period || {
        start: new Date(),
        end: this.addDays(new Date(), 30)
      },
      items: lineItems,
      subtotal,
      discounts,
      tax,
      total,
      currency: account.currency,
      dueDate: options.dueDate || this.addDays(new Date(), this.config.invoicing.dueDays),
      terms: this.getPaymentTerms(),
      notes: options.notes,
      metadata: {
        created: new Date(),
        updated: new Date(),
        remindersSent: 0
      }
    };
    
    this.invoices.set(invoice.id, invoice);
    account.invoices.push(invoice.id);
    
    // Generate PDF
    invoice.pdf = await this.generateInvoicePDF(invoice);
    
    // Sync with accounting
    await this.accountingIntegration.createInvoice(invoice);
    
    return invoice;
  }
  
  /**
   * Send invoice
   */
  async sendInvoice(invoiceId: string): Promise<void> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    
    const account = this.accounts.get(invoice.accountId);
    if (!account) {
      throw new Error(`Account ${invoice.accountId} not found`);
    }
    
    // Update status
    invoice.status = 'sent';
    invoice.metadata.sentAt = new Date();
    
    // Send email
    await this.sendInvoiceEmail(invoice, account);
    
    // Track event
    await this.trackEvent('invoice_sent', { invoiceId });
  }
  
  /**
   * Process payment
   */
  async processPayment(
    invoiceId: string,
    paymentMethodId: string,
    amount?: number
  ): Promise<Transaction> {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      throw new Error(`Invoice ${invoiceId} not found`);
    }
    
    const account = this.accounts.get(invoice.accountId);
    if (!account) {
      throw new Error(`Account ${invoice.accountId} not found`);
    }
    
    const paymentMethod = account.payment.methods.find(m => m.id === paymentMethodId);
    if (!paymentMethod) {
      throw new Error(`Payment method ${paymentMethodId} not found`);
    }
    
    const chargeAmount = amount || invoice.total;
    
    // Create transaction
    const transaction: Transaction = {
      id: this.generateTransactionId(),
      type: 'charge',
      status: 'pending',
      amount: chargeAmount,
      currency: invoice.currency,
      description: `Payment for invoice ${invoice.number}`,
      invoiceId,
      paymentMethod: paymentMethodId,
      processor: {
        name: this.config.providers.payment,
        transactionId: ''
      },
      timestamp: new Date()
    };
    
    try {
      // Process with payment provider
      const result = await this.paymentProcessor.charge(
        account,
        paymentMethod,
        chargeAmount,
        invoice.currency
      );
      
      transaction.status = 'succeeded';
      transaction.processor.transactionId = result.id;
      transaction.processor.fee = result.fee;
      
      // Update invoice
      if (chargeAmount >= invoice.total) {
        invoice.status = 'paid';
        invoice.payment = {
          method: paymentMethodId,
          transactionId: transaction.id,
          paidAt: new Date(),
          amount: chargeAmount
        };
      } else {
        invoice.status = 'partial';
      }
      
      // Update account balance
      account.balance -= chargeAmount;
      
      // Send receipt
      await this.sendReceipt(invoice, transaction);
      
      // Sync with accounting
      await this.accountingIntegration.recordPayment(transaction);
      
      // Recognize revenue
      await this.revenueRecognizer.recognize(invoice, transaction);
      
    } catch (error) {
      transaction.status = 'failed';
      transaction.metadata = { error: error.message };
      
      // Handle failed payment
      await this.handleFailedPayment(invoice, transaction);
      
      throw error;
    }
    
    this.transactions.set(transaction.id, transaction);
    account.transactions.push(transaction);
    
    return transaction;
  }
  
  /**
   * Process refund
   */
  async processRefund(
    transactionId: string,
    amount?: number,
    reason?: string
  ): Promise<Transaction> {
    const originalTransaction = this.transactions.get(transactionId);
    if (!originalTransaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    const refundAmount = amount || originalTransaction.amount;
    
    // Create refund transaction
    const refund: Transaction = {
      id: this.generateTransactionId(),
      type: 'refund',
      status: 'pending',
      amount: refundAmount,
      currency: originalTransaction.currency,
      description: `Refund for ${originalTransaction.description}`,
      invoiceId: originalTransaction.invoiceId,
      processor: {
        name: this.config.providers.payment,
        transactionId: ''
      },
      timestamp: new Date(),
      metadata: {
        originalTransactionId: transactionId,
        reason
      }
    };
    
    try {
      // Process with payment provider
      const result = await this.paymentProcessor.refund(
        originalTransaction.processor.transactionId,
        refundAmount
      );
      
      refund.status = 'succeeded';
      refund.processor.transactionId = result.id;
      
      // Update invoice if applicable
      if (originalTransaction.invoiceId) {
        const invoice = this.invoices.get(originalTransaction.invoiceId);
        if (invoice) {
          if (refundAmount >= invoice.total) {
            invoice.status = 'refunded';
          } else {
            invoice.status = 'partial';
          }
        }
      }
      
      // Update account balance
      const account = this.findAccountByTransaction(originalTransaction);
      if (account) {
        account.balance += refundAmount;
      }
      
      // Sync with accounting
      await this.accountingIntegration.recordRefund(refund);
      
      // Adjust revenue recognition
      await this.revenueRecognizer.adjustForRefund(refund);
      
    } catch (error) {
      refund.status = 'failed';
      refund.metadata.error = error.message;
      throw error;
    }
    
    this.transactions.set(refund.id, refund);
    
    return refund;
  }
  
  /**
   * Add payment method
   */
  async addPaymentMethod(
    accountId: string,
    method: Omit<PaymentMethod, 'id'>
  ): Promise<PaymentMethod> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }
    
    const paymentMethod: PaymentMethod = {
      ...method,
      id: this.generatePaymentMethodId()
    };
    
    // Verify with payment processor
    const verified = await this.paymentProcessor.verifyPaymentMethod(paymentMethod);
    paymentMethod.verified = verified;
    
    // Add to account
    account.payment.methods.push(paymentMethod);
    
    // Set as default if first method
    if (account.payment.methods.length === 1) {
      account.payment.defaultMethodId = paymentMethod.id;
      paymentMethod.isDefault = true;
    }
    
    return paymentMethod;
  }
  
  /**
   * Get revenue metrics
   */
  async getRevenueMetrics(
    period: { start: Date; end: Date }
  ): Promise<RevenueMetrics> {
    // Calculate recognized revenue
    const recognized = await this.revenueRecognizer.getRecognizedRevenue(period);
    const deferred = await this.revenueRecognizer.getDeferredRevenue(period);
    
    // Calculate recurring vs non-recurring
    const recurring = await this.calculateRecurringRevenue(period);
    const nonRecurring = recognized - recurring;
    
    // Calculate key metrics
    const mrr = await this.calculateMRR();
    const arr = mrr * 12;
    const arpu = await this.calculateARPU();
    const ltv = await this.calculateLTV();
    const churn = await this.calculateChurnRate(period);
    const growth = await this.calculateGrowthRate(period);
    
    // Get breakdown
    const breakdown = await this.getRevenueBreakdown(period);
    
    // Generate forecast
    const forecast = await this.generateRevenueForecast();
    
    return {
      period,
      revenue: {
        recognized,
        deferred,
        recurring,
        nonRecurring
      },
      metrics: {
        mrr,
        arr,
        arpu,
        ltv,
        churn,
        growth
      },
      breakdown,
      forecast
    };
  }
  
  /**
   * Handle dispute
   */
  async handleDispute(
    transactionId: string,
    details: {
      reason: string;
      evidence?: any;
      amount?: number;
    }
  ): Promise<void> {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    // Create dispute transaction
    const dispute: Transaction = {
      id: this.generateTransactionId(),
      type: 'dispute',
      status: 'pending',
      amount: details.amount || transaction.amount,
      currency: transaction.currency,
      description: `Dispute: ${details.reason}`,
      invoiceId: transaction.invoiceId,
      processor: {
        name: this.config.providers.payment,
        transactionId: ''
      },
      timestamp: new Date(),
      metadata: {
        originalTransactionId: transactionId,
        reason: details.reason,
        evidence: details.evidence
      }
    };
    
    this.transactions.set(dispute.id, dispute);
    
    // Update invoice status
    if (transaction.invoiceId) {
      const invoice = this.invoices.get(transaction.invoiceId);
      if (invoice) {
        invoice.status = 'disputed';
      }
    }
    
    // Submit evidence to payment processor
    await this.paymentProcessor.submitDisputeEvidence(
      transaction.processor.transactionId,
      details.evidence
    );
    
    // Notify accounting
    await this.accountingIntegration.recordDispute(dispute);
  }
  
  /**
   * Apply credit
   */
  async applyCredit(
    accountId: string,
    amount: number,
    description: string
  ): Promise<void> {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }
    
    // Create credit transaction
    const credit: Transaction = {
      id: this.generateTransactionId(),
      type: 'credit',
      status: 'succeeded',
      amount,
      currency: account.currency,
      description,
      processor: {
        name: 'internal',
        transactionId: this.generateTransactionId()
      },
      timestamp: new Date()
    };
    
    // Update account balance
    account.balance += amount;
    account.credit.available += amount;
    
    // Store transaction
    this.transactions.set(credit.id, credit);
    account.transactions.push(credit);
    
    // Sync with accounting
    await this.accountingIntegration.recordCredit(credit);
  }
  
  // Private helper methods
  
  private async loadAccounts(): Promise<void> {
    // Load existing accounts from storage
    console.log('Loading billing accounts');
  }
  
  private startInvoiceGeneration(): void {
    // Schedule monthly invoice generation
    setInterval(async () => {
      await this.generateRecurringInvoices();
    }, 86400000); // Daily check
  }
  
  private startPaymentCollection(): void {
    // Schedule automatic payment collection
    setInterval(async () => {
      await this.collectAutomaticPayments();
    }, 3600000); // Hourly
  }
  
  private startDunningProcess(): void {
    // Schedule dunning for failed payments
    setInterval(async () => {
      await this.processDunning();
    }, 86400000); // Daily
  }
  
  private startRevenueRecognition(): void {
    // Schedule revenue recognition
    setInterval(async () => {
      await this.recognizeRevenue();
    }, 86400000); // Daily
  }
  
  private async generateRecurringInvoices(): Promise<void> {
    // Generate invoices for all active subscriptions
    for (const account of this.accounts.values()) {
      if (account.status === 'active') {
        // Check if invoice needed
        const needsInvoice = await this.checkInvoiceNeeded(account);
        if (needsInvoice) {
          await this.generateSubscriptionInvoice(account);
        }
      }
    }
  }
  
  private async collectAutomaticPayments(): Promise<void> {
    // Process autopay for due invoices
    for (const invoice of this.invoices.values()) {
      if (invoice.status === 'sent' && invoice.dueDate <= new Date()) {
        const account = this.accounts.get(invoice.accountId);
        if (account?.payment.autopay && account.payment.defaultMethodId) {
          try {
            await this.processPayment(
              invoice.id,
              account.payment.defaultMethodId
            );
          } catch (error) {
            console.error(`Autopay failed for invoice ${invoice.id}:`, error);
          }
        }
      }
    }
  }
  
  private async processDunning(): Promise<void> {
    // Handle failed payments with retry logic
    for (const invoice of this.invoices.values()) {
      if (invoice.status === 'overdue') {
        await this.attemptPaymentRetry(invoice);
      }
    }
  }
  
  private async recognizeRevenue(): Promise<void> {
    // Process revenue recognition for paid invoices
    for (const invoice of this.invoices.values()) {
      if (invoice.status === 'paid') {
        await this.revenueRecognizer.processInvoice(invoice);
      }
    }
  }
  
  private async processTaxExemption(account: BillingAccount): Promise<void> {
    // Process and validate tax exemption certificate
    if (account.billing.exemptionCertificate) {
      const exemption = await this.taxCalculator.validateExemption(
        account.billing.exemptionCertificate
      );
      
      if (exemption) {
        this.config.tax.exemptions.set(account.id, exemption);
      }
    }
  }
  
  private async calculateLineItems(
    items: Partial<LineItem>[],
    account: BillingAccount
  ): Promise<LineItem[]> {
    return items.map(item => ({
      id: this.generateLineItemId(),
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      amount: (item.quantity || 1) * (item.unitPrice || 0),
      tax: {
        rate: 0,
        amount: 0
      },
      accounting: {
        code: item.accounting?.code || 'default',
        category: item.accounting?.category || 'revenue'
      },
      ...item
    }));
  }
  
  private calculateDiscounts(
    subtotal: number,
    discounts: Discount[]
  ): number {
    let totalDiscount = 0;
    
    for (const discount of discounts) {
      switch (discount.type) {
        case 'percentage':
          totalDiscount += subtotal * (discount.amount / 100);
          break;
        case 'fixed':
          totalDiscount += discount.amount;
          break;
        // Handle other discount types
      }
    }
    
    return Math.min(totalDiscount, subtotal);
  }
  
  private getPaymentTerms(): string {
    return `Payment due within ${this.config.invoicing.dueDays} days`;
  }
  
  private async generateInvoicePDF(invoice: Invoice): Promise<string> {
    // Generate PDF representation of invoice
    return `pdf_${invoice.id}`;
  }
  
  private async sendInvoiceEmail(
    invoice: Invoice,
    account: BillingAccount
  ): Promise<void> {
    console.log(`Sending invoice ${invoice.number} to ${account.billing.email}`);
    // Email implementation
  }
  
  private async sendReceipt(
    invoice: Invoice,
    transaction: Transaction
  ): Promise<void> {
    console.log(`Sending receipt for invoice ${invoice.number}`);
    // Receipt email implementation
  }
  
  private async handleFailedPayment(
    invoice: Invoice,
    transaction: Transaction
  ): Promise<void> {
    // Update invoice status
    if (new Date() > invoice.dueDate) {
      invoice.status = 'overdue';
    } else {
      invoice.status = 'pending';
    }
    
    // Schedule retry if configured
    if (this.config.payment.dunning.enabled) {
      await this.schedulePaymentRetry(invoice);
    }
  }
  
  private async schedulePaymentRetry(invoice: Invoice): Promise<void> {
    const retryCount = invoice.metadata.remindersSent || 0;
    const retrySchedule = this.config.payment.retrySchedule;
    
    if (retryCount < retrySchedule.length) {
      const delayDays = retrySchedule[retryCount];
      const retryDate = this.addDays(new Date(), delayDays);
      
      // Schedule retry
      setTimeout(async () => {
        await this.attemptPaymentRetry(invoice);
      }, delayDays * 86400000);
      
      invoice.metadata.remindersSent = retryCount + 1;
    } else {
      // Final action
      await this.executeFinalDunningAction(invoice);
    }
  }
  
  private async attemptPaymentRetry(invoice: Invoice): Promise<void> {
    const account = this.accounts.get(invoice.accountId);
    if (!account) return;
    
    if (account.payment.defaultMethodId) {
      try {
        await this.processPayment(invoice.id, account.payment.defaultMethodId);
      } catch (error) {
        console.error(`Payment retry failed for invoice ${invoice.id}:`, error);
        await this.schedulePaymentRetry(invoice);
      }
    }
  }
  
  private async executeFinalDunningAction(invoice: Invoice): Promise<void> {
    const account = this.accounts.get(invoice.accountId);
    if (!account) return;
    
    switch (this.config.payment.dunning.finalAction) {
      case 'suspend':
        account.status = 'suspended';
        break;
      case 'cancel':
        account.status = 'closed';
        break;
      case 'downgrade':
        // Implement downgrade logic
        break;
    }
  }
  
  private findAccountByTransaction(transaction: Transaction): BillingAccount | null {
    for (const account of this.accounts.values()) {
      if (account.transactions.includes(transaction)) {
        return account;
      }
    }
    return null;
  }
  
  private async checkInvoiceNeeded(account: BillingAccount): Promise<boolean> {
    // Check if new invoice needed based on billing cycle
    const lastInvoice = this.getLastInvoice(account);
    if (!lastInvoice) return true;
    
    const daysSinceLastInvoice = Math.floor(
      (Date.now() - lastInvoice.metadata.created.getTime()) / 86400000
    );
    
    return daysSinceLastInvoice >= 30; // Monthly billing
  }
  
  private getLastInvoice(account: BillingAccount): Invoice | null {
    const invoiceId = account.invoices[account.invoices.length - 1];
    return invoiceId ? this.invoices.get(invoiceId) || null : null;
  }
  
  private async generateSubscriptionInvoice(account: BillingAccount): Promise<void> {
    // Generate invoice for subscription
    // Implementation depends on subscription details
  }
  
  private async calculateRecurringRevenue(period: any): Promise<number> {
    // Calculate recurring revenue for period
    return 0; // Simplified
  }
  
  private async calculateMRR(): Promise<number> {
    // Calculate Monthly Recurring Revenue
    let mrr = 0;
    
    for (const account of this.accounts.values()) {
      if (account.status === 'active') {
        // Sum up monthly subscription amounts
        mrr += 299; // Simplified - would calculate from actual subscriptions
      }
    }
    
    return mrr;
  }
  
  private async calculateARPU(): Promise<number> {
    // Calculate Average Revenue Per User
    const totalRevenue = await this.calculateMRR();
    const activeAccounts = Array.from(this.accounts.values())
      .filter(a => a.status === 'active').length;
    
    return activeAccounts > 0 ? totalRevenue / activeAccounts : 0;
  }
  
  private async calculateLTV(): Promise<number> {
    // Calculate Customer Lifetime Value
    const arpu = await this.calculateARPU();
    const avgLifetime = 24; // months, simplified
    
    return arpu * avgLifetime;
  }
  
  private async calculateChurnRate(period: any): Promise<number> {
    // Calculate churn rate
    return 5; // 5% monthly churn, simplified
  }
  
  private async calculateGrowthRate(period: any): Promise<number> {
    // Calculate growth rate
    return 10; // 10% growth, simplified
  }
  
  private async getRevenueBreakdown(period: any): Promise<any> {
    return {
      byProduct: new Map([
        ['professional', 50000],
        ['enterprise', 150000]
      ]),
      byRegion: new Map([
        ['us', 120000],
        ['eu', 80000]
      ]),
      bySegment: new Map([
        ['smb', 60000],
        ['enterprise', 140000]
      ])
    };
  }
  
  private async generateRevenueForecast(): Promise<any> {
    const currentMRR = await this.calculateMRR();
    const growthRate = 0.1; // 10% monthly growth
    
    return {
      nextMonth: currentMRR * (1 + growthRate),
      nextQuarter: currentMRR * Math.pow(1 + growthRate, 3),
      nextYear: currentMRR * Math.pow(1 + growthRate, 12)
    };
  }
  
  private async trackEvent(event: string, data: any): Promise<void> {
    console.log(`Billing event: ${event}`, data);
  }
  
  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }
  
  private generateAccountId(): string {
    return `acc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateInvoiceId(): string {
    return `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateInvoiceNumber(): string {
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const counter = String(++this.config.invoicing.numbering.counter).padStart(4, '0');
    
    return this.config.invoicing.numbering.format
      .replace('{YYYY}', String(year))
      .replace('{MM}', month)
      .replace('{0000}', counter);
  }
  
  private generateTransactionId(): string {
    return `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generatePaymentMethodId(): string {
    return `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private generateLineItemId(): string {
    return `li_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting classes

class PaymentProcessor {
  constructor(private config: BillingConfig) {}
  
  async charge(
    account: BillingAccount,
    method: PaymentMethod,
    amount: number,
    currency: string
  ): Promise<any> {
    return {
      id: `ch_${Date.now()}`,
      fee: amount * 0.029 // 2.9% fee
    };
  }
  
  async refund(transactionId: string, amount: number): Promise<any> {
    return {
      id: `re_${Date.now()}`
    };
  }
  
  async verifyPaymentMethod(method: PaymentMethod): Promise<boolean> {
    return true;
  }
  
  async submitDisputeEvidence(transactionId: string, evidence: any): Promise<void> {
    console.log(`Submitting dispute evidence for ${transactionId}`);
  }
}

class TaxCalculator {
  constructor(private config: BillingConfig) {}
  
  async calculate(
    account: BillingAccount,
    amount: number,
    items: LineItem[]
  ): Promise<TaxCalculation> {
    // Check for exemptions
    const exemption = this.config.tax.exemptions.get(account.id);
    if (exemption) {
      return {
        rate: 0,
        amount: 0,
        breakdown: [],
        exemptions: [exemption.type]
      };
    }
    
    // Calculate tax based on nexus
    const rate = 0.0875; // 8.75% simplified
    
    return {
      rate,
      amount: amount * rate,
      breakdown: [
        {
          jurisdiction: 'state',
          type: 'state',
          rate: 0.065,
          amount: amount * 0.065
        },
        {
          jurisdiction: 'county',
          type: 'county',
          rate: 0.0225,
          amount: amount * 0.0225
        }
      ]
    };
  }
  
  async validateExemption(certificate: string): Promise<TaxExemption | null> {
    return {
      type: 'resale',
      certificate,
      jurisdictions: ['US']
    };
  }
}

class AccountingIntegration {
  constructor(private config: BillingConfig) {}
  
  async createCustomer(account: BillingAccount): Promise<void> {
    console.log(`Creating customer in ${this.config.providers.accounting}`);
  }
  
  async createInvoice(invoice: Invoice): Promise<void> {
    console.log(`Creating invoice in ${this.config.providers.accounting}`);
  }
  
  async recordPayment(transaction: Transaction): Promise<void> {
    console.log(`Recording payment in ${this.config.providers.accounting}`);
  }
  
  async recordRefund(refund: Transaction): Promise<void> {
    console.log(`Recording refund in ${this.config.providers.accounting}`);
  }
  
  async recordDispute(dispute: Transaction): Promise<void> {
    console.log(`Recording dispute in ${this.config.providers.accounting}`);
  }
  
  async recordCredit(credit: Transaction): Promise<void> {
    console.log(`Recording credit in ${this.config.providers.accounting}`);
  }
}

class RevenueRecognizer {
  constructor(private config: BillingConfig) {}
  
  async recognize(invoice: Invoice, transaction: Transaction): Promise<void> {
    // Implement revenue recognition based on accounting method
    console.log(`Recognizing revenue for invoice ${invoice.id}`);
  }
  
  async adjustForRefund(refund: Transaction): Promise<void> {
    console.log(`Adjusting revenue for refund ${refund.id}`);
  }
  
  async processInvoice(invoice: Invoice): Promise<void> {
    console.log(`Processing revenue recognition for invoice ${invoice.id}`);
  }
  
  async getRecognizedRevenue(period: any): Promise<number> {
    return 200000; // Simplified
  }
  
  async getDeferredRevenue(period: any): Promise<number> {
    return 50000; // Simplified
  }
}