/**
 * Dashboard Engine
 * Real-time interactive dashboards with WebSocket streaming
 * Supports custom widgets, alerts, and collaborative features
 */

export interface DashboardConfig {
  layout: {
    type: 'grid' | 'flex' | 'masonry' | 'custom';
    columns: number;
    rows: number;
    responsive: boolean;
  };
  theme: {
    mode: 'light' | 'dark' | 'auto';
    colors: {
      primary: string;
      secondary: string;
      success: string;
      warning: string;
      danger: string;
      info: string;
    };
    fonts: {
      display: string;
      body: string;
      mono: string;
    };
  };
  features: {
    realtime: boolean;
    collaboration: boolean;
    export: boolean;
    customization: boolean;
    notifications: boolean;
    annotations: boolean;
  };
  refresh: {
    interval: number; // seconds
    strategy: 'polling' | 'websocket' | 'sse' | 'hybrid';
  };
}

export interface Dashboard {
  id: string;
  name: string;
  description: string;
  owner: string;
  created: Date;
  modified: Date;
  layout: DashboardLayout;
  widgets: Widget[];
  filters: Filter[];
  alerts: Alert[];
  permissions: Permission[];
  tags: string[];
  starred: boolean;
}

export interface DashboardLayout {
  type: string;
  grid: GridPosition[];
  breakpoints: {
    mobile: number;
    tablet: number;
    desktop: number;
  };
}

export interface GridPosition {
  widgetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  resizable: boolean;
  draggable: boolean;
}

export interface Widget {
  id: string;
  type: WidgetType;
  title: string;
  config: any;
  dataSource: DataSource;
  visualization: Visualization;
  interactions: Interaction[];
  refreshRate?: number;
  lastUpdated?: Date;
}

export type WidgetType = 
  | 'metric' | 'chart' | 'gauge' | 'table' | 'map' 
  | 'timeline' | 'heatmap' | 'treemap' | 'sankey'
  | 'network' | 'funnel' | 'custom';

export interface DataSource {
  type: 'api' | 'database' | 'stream' | 'computed';
  endpoint?: string;
  query?: string;
  aggregation?: string;
  transformation?: (data: any) => any;
  cache?: {
    enabled: boolean;
    ttl: number;
  };
}

export interface Visualization {
  type: string;
  options: any;
  colors?: string[];
  animations?: boolean;
  interactive?: boolean;
}

export interface Interaction {
  type: 'click' | 'hover' | 'drag' | 'zoom' | 'filter';
  action: 'drill-down' | 'filter' | 'navigate' | 'tooltip' | 'custom';
  target?: string;
  handler?: (event: any) => void;
}

export interface Filter {
  id: string;
  name: string;
  type: 'date-range' | 'select' | 'multi-select' | 'search' | 'slider';
  field: string;
  values: any[];
  default?: any;
  affects: string[]; // widget IDs
}

export interface Alert {
  id: string;
  name: string;
  condition: AlertCondition;
  actions: AlertAction[];
  enabled: boolean;
  lastTriggered?: Date;
  frequency: number; // minimum seconds between alerts
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains';
  threshold: number | string;
  duration?: number; // seconds condition must be true
}

export interface AlertAction {
  type: 'email' | 'slack' | 'webhook' | 'notification' | 'custom';
  config: any;
}

export interface Permission {
  userId?: string;
  groupId?: string;
  role: 'viewer' | 'editor' | 'admin';
  granted: Date;
  grantedBy: string;
}

export interface DashboardMetrics {
  views: number;
  uniqueViewers: number;
  avgViewDuration: number;
  widgetInteractions: Map<string, number>;
  exportCount: number;
  shareCount: number;
  performance: {
    loadTime: number;
    renderTime: number;
    dataFetchTime: number;
  };
}

export interface Annotation {
  id: string;
  widgetId: string;
  x: number;
  y: number;
  text: string;
  author: string;
  created: Date;
  replies: Reply[];
}

export interface Reply {
  id: string;
  text: string;
  author: string;
  created: Date;
}

export class DashboardEngine {
  private config: DashboardConfig;
  private dashboards: Map<string, Dashboard> = new Map();
  private widgets: Map<string, Widget> = new Map();
  private connections: Map<string, WebSocket> = new Map();
  private dataStreams: Map<string, DataStream> = new Map();
  private cache: Map<string, CachedData> = new Map();
  private metrics: Map<string, DashboardMetrics> = new Map();
  private annotations: Map<string, Annotation[]> = new Map();
  private collaborators: Map<string, Set<string>> = new Map();
  
  constructor(config?: Partial<DashboardConfig>) {
    this.config = {
      layout: {
        type: 'grid',
        columns: 12,
        rows: 8,
        responsive: true
      },
      theme: {
        mode: 'auto',
        colors: {
          primary: '#3b82f6',
          secondary: '#8b5cf6',
          success: '#10b981',
          warning: '#f59e0b',
          danger: '#ef4444',
          info: '#06b6d4'
        },
        fonts: {
          display: 'Inter',
          body: 'system-ui',
          mono: 'Fira Code'
        }
      },
      features: {
        realtime: true,
        collaboration: true,
        export: true,
        customization: true,
        notifications: true,
        annotations: true
      },
      refresh: {
        interval: 30,
        strategy: 'websocket'
      },
      ...config
    };
    
    this.initialize();
  }
  
  /**
   * Initialize dashboard engine
   */
  private async initialize(): Promise<void> {
    // Load default widgets
    this.loadDefaultWidgets();
    
    // Start data streams
    if (this.config.features.realtime) {
      this.startDataStreams();
    }
    
    // Initialize WebSocket server
    if (this.config.refresh.strategy === 'websocket') {
      this.initializeWebSocket();
    }
    
    console.log('Dashboard engine initialized');
  }
  
  /**
   * Create new dashboard
   */
  async createDashboard(
    name: string,
    description: string,
    owner: string,
    template?: string
  ): Promise<Dashboard> {
    const dashboard: Dashboard = {
      id: this.generateId(),
      name,
      description,
      owner,
      created: new Date(),
      modified: new Date(),
      layout: this.createDefaultLayout(),
      widgets: [],
      filters: [],
      alerts: [],
      permissions: [
        {
          userId: owner,
          role: 'admin',
          granted: new Date(),
          grantedBy: 'system'
        }
      ],
      tags: [],
      starred: false
    };
    
    // Apply template if provided
    if (template) {
      await this.applyTemplate(dashboard, template);
    }
    
    this.dashboards.set(dashboard.id, dashboard);
    
    // Initialize metrics
    this.metrics.set(dashboard.id, this.createDefaultMetrics());
    
    // Notify collaborators
    if (this.config.features.collaboration) {
      this.notifyCollaborators(dashboard.id, 'dashboard_created', dashboard);
    }
    
    return dashboard;
  }
  
  /**
   * Add widget to dashboard
   */
  async addWidget(
    dashboardId: string,
    widget: Partial<Widget>,
    position?: GridPosition
  ): Promise<Widget> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }
    
    const fullWidget: Widget = {
      id: this.generateId(),
      type: widget.type || 'metric',
      title: widget.title || 'New Widget',
      config: widget.config || {},
      dataSource: widget.dataSource || {
        type: 'api',
        cache: { enabled: true, ttl: 60 }
      },
      visualization: widget.visualization || {
        type: 'default',
        options: {},
        animations: true,
        interactive: true
      },
      interactions: widget.interactions || [],
      refreshRate: widget.refreshRate || this.config.refresh.interval,
      lastUpdated: new Date(),
      ...widget
    };
    
    // Add to dashboard
    dashboard.widgets.push(fullWidget);
    this.widgets.set(fullWidget.id, fullWidget);
    
    // Add position if provided
    if (position) {
      dashboard.layout.grid.push(position);
    } else {
      // Auto-position widget
      const autoPosition = this.calculateAutoPosition(dashboard);
      dashboard.layout.grid.push({
        ...autoPosition,
        widgetId: fullWidget.id
      });
    }
    
    // Start data updates
    if (this.config.features.realtime) {
      this.startWidgetUpdates(fullWidget);
    }
    
    // Update dashboard
    dashboard.modified = new Date();
    
    // Notify collaborators
    this.notifyCollaborators(dashboardId, 'widget_added', fullWidget);
    
    return fullWidget;
  }
  
  /**
   * Update widget data
   */
  async updateWidget(
    widgetId: string,
    updates: Partial<Widget>
  ): Promise<void> {
    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error(`Widget ${widgetId} not found`);
    }
    
    // Apply updates
    Object.assign(widget, updates);
    widget.lastUpdated = new Date();
    
    // Refresh data if source changed
    if (updates.dataSource) {
      await this.refreshWidgetData(widget);
    }
    
    // Notify subscribers
    this.broadcastWidgetUpdate(widgetId, widget);
  }
  
  /**
   * Get widget data
   */
  async getWidgetData(widgetId: string): Promise<any> {
    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error(`Widget ${widgetId} not found`);
    }
    
    // Check cache
    if (widget.dataSource.cache?.enabled) {
      const cached = this.getFromCache(widgetId);
      if (cached) {
        return cached;
      }
    }
    
    // Fetch fresh data
    const data = await this.fetchWidgetData(widget);
    
    // Cache if enabled
    if (widget.dataSource.cache?.enabled) {
      this.cacheData(widgetId, data, widget.dataSource.cache.ttl);
    }
    
    return data;
  }
  
  /**
   * Create real-time subscription
   */
  subscribe(
    dashboardId: string,
    userId: string,
    callback: (update: any) => void
  ): () => void {
    // Add to collaborators
    if (!this.collaborators.has(dashboardId)) {
      this.collaborators.set(dashboardId, new Set());
    }
    this.collaborators.get(dashboardId)!.add(userId);
    
    // Create subscription
    const subscriptionId = `${dashboardId}_${userId}`;
    
    if (this.config.refresh.strategy === 'websocket') {
      // WebSocket subscription
      const ws = this.createWebSocketConnection(subscriptionId, callback);
      this.connections.set(subscriptionId, ws);
    } else if (this.config.refresh.strategy === 'sse') {
      // Server-sent events
      this.createSSEConnection(subscriptionId, callback);
    } else {
      // Polling
      const interval = setInterval(async () => {
        const updates = await this.getUpdates(dashboardId);
        callback(updates);
      }, this.config.refresh.interval * 1000);
      
      // Return unsubscribe function
      return () => clearInterval(interval);
    }
    
    // Return unsubscribe function
    return () => this.unsubscribe(subscriptionId);
  }
  
  /**
   * Unsubscribe from updates
   */
  private unsubscribe(subscriptionId: string): void {
    const [dashboardId, userId] = subscriptionId.split('_');
    
    // Remove from collaborators
    this.collaborators.get(dashboardId)?.delete(userId);
    
    // Close connection
    const connection = this.connections.get(subscriptionId);
    if (connection) {
      connection.close();
      this.connections.delete(subscriptionId);
    }
  }
  
  /**
   * Add filter to dashboard
   */
  async addFilter(
    dashboardId: string,
    filter: Partial<Filter>
  ): Promise<Filter> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }
    
    const fullFilter: Filter = {
      id: this.generateId(),
      name: filter.name || 'New Filter',
      type: filter.type || 'select',
      field: filter.field || '',
      values: filter.values || [],
      affects: filter.affects || dashboard.widgets.map(w => w.id),
      ...filter
    };
    
    dashboard.filters.push(fullFilter);
    
    // Apply filter to affected widgets
    await this.applyFilter(dashboardId, fullFilter);
    
    return fullFilter;
  }
  
  /**
   * Apply filter to widgets
   */
  private async applyFilter(
    dashboardId: string,
    filter: Filter
  ): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return;
    
    // Apply to each affected widget
    for (const widgetId of filter.affects) {
      const widget = this.widgets.get(widgetId);
      if (!widget) continue;
      
      // Modify data source query
      if (widget.dataSource.query) {
        widget.dataSource.query = this.applyFilterToQuery(
          widget.dataSource.query,
          filter
        );
      }
      
      // Refresh widget data
      await this.refreshWidgetData(widget);
    }
    
    // Notify subscribers
    this.notifyCollaborators(dashboardId, 'filter_applied', filter);
  }
  
  /**
   * Create alert
   */
  async createAlert(
    dashboardId: string,
    alert: Partial<Alert>
  ): Promise<Alert> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }
    
    const fullAlert: Alert = {
      id: this.generateId(),
      name: alert.name || 'New Alert',
      condition: alert.condition || {
        metric: '',
        operator: 'gt',
        threshold: 0
      },
      actions: alert.actions || [],
      enabled: alert.enabled !== false,
      frequency: alert.frequency || 300, // 5 minutes default
      ...alert
    };
    
    dashboard.alerts.push(fullAlert);
    
    // Start monitoring
    if (fullAlert.enabled) {
      this.startAlertMonitoring(dashboardId, fullAlert);
    }
    
    return fullAlert;
  }
  
  /**
   * Monitor alert conditions
   */
  private startAlertMonitoring(dashboardId: string, alert: Alert): void {
    const checkAlert = async () => {
      const value = await this.getMetricValue(dashboardId, alert.condition.metric);
      
      if (this.evaluateCondition(value, alert.condition)) {
        // Check duration if specified
        if (alert.condition.duration) {
          // Wait and check again
          setTimeout(async () => {
            const newValue = await this.getMetricValue(dashboardId, alert.condition.metric);
            if (this.evaluateCondition(newValue, alert.condition)) {
              await this.triggerAlert(dashboardId, alert);
            }
          }, alert.condition.duration * 1000);
        } else {
          await this.triggerAlert(dashboardId, alert);
        }
      }
    };
    
    // Check periodically
    setInterval(checkAlert, alert.frequency * 1000);
  }
  
  /**
   * Trigger alert actions
   */
  private async triggerAlert(dashboardId: string, alert: Alert): Promise<void> {
    // Check if recently triggered
    if (alert.lastTriggered) {
      const elapsed = Date.now() - alert.lastTriggered.getTime();
      if (elapsed < alert.frequency * 1000) {
        return; // Too soon
      }
    }
    
    alert.lastTriggered = new Date();
    
    // Execute each action
    for (const action of alert.actions) {
      await this.executeAlertAction(action, alert, dashboardId);
    }
    
    // Log alert
    console.log(`Alert triggered: ${alert.name} on dashboard ${dashboardId}`);
  }
  
  /**
   * Execute alert action
   */
  private async executeAlertAction(
    action: AlertAction,
    alert: Alert,
    dashboardId: string
  ): Promise<void> {
    switch (action.type) {
      case 'email':
        await this.sendEmailAlert(action.config, alert);
        break;
      
      case 'slack':
        await this.sendSlackAlert(action.config, alert);
        break;
      
      case 'webhook':
        await this.callWebhook(action.config, alert);
        break;
      
      case 'notification':
        await this.sendNotification(action.config, alert, dashboardId);
        break;
      
      case 'custom':
        if (action.config.handler) {
          await action.config.handler(alert);
        }
        break;
    }
  }
  
  /**
   * Add annotation to widget
   */
  async addAnnotation(
    widgetId: string,
    annotation: Partial<Annotation>
  ): Promise<Annotation> {
    const widget = this.widgets.get(widgetId);
    if (!widget) {
      throw new Error(`Widget ${widgetId} not found`);
    }
    
    const fullAnnotation: Annotation = {
      id: this.generateId(),
      widgetId,
      x: annotation.x || 0,
      y: annotation.y || 0,
      text: annotation.text || '',
      author: annotation.author || 'anonymous',
      created: new Date(),
      replies: [],
      ...annotation
    };
    
    // Store annotation
    if (!this.annotations.has(widgetId)) {
      this.annotations.set(widgetId, []);
    }
    this.annotations.get(widgetId)!.push(fullAnnotation);
    
    // Notify collaborators
    this.broadcastAnnotation(widgetId, fullAnnotation);
    
    return fullAnnotation;
  }
  
  /**
   * Export dashboard
   */
  async exportDashboard(
    dashboardId: string,
    format: 'pdf' | 'png' | 'csv' | 'json'
  ): Promise<Buffer> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }
    
    // Collect all widget data
    const widgetData = await Promise.all(
      dashboard.widgets.map(async widget => ({
        widget,
        data: await this.getWidgetData(widget.id)
      }))
    );
    
    // Generate export based on format
    switch (format) {
      case 'pdf':
        return this.exportToPDF(dashboard, widgetData);
      
      case 'png':
        return this.exportToPNG(dashboard, widgetData);
      
      case 'csv':
        return this.exportToCSV(dashboard, widgetData);
      
      case 'json':
        return Buffer.from(JSON.stringify({
          dashboard,
          data: widgetData
        }, null, 2));
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }
  
  /**
   * Get dashboard metrics
   */
  getMetrics(dashboardId: string): DashboardMetrics | undefined {
    return this.metrics.get(dashboardId);
  }
  
  /**
   * Share dashboard
   */
  async shareDashboard(
    dashboardId: string,
    userId: string,
    role: 'viewer' | 'editor' | 'admin',
    grantedBy: string
  ): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboardId} not found`);
    }
    
    // Add permission
    dashboard.permissions.push({
      userId,
      role,
      granted: new Date(),
      grantedBy
    });
    
    // Update metrics
    const metrics = this.metrics.get(dashboardId);
    if (metrics) {
      metrics.shareCount++;
    }
    
    // Send notification
    if (this.config.features.notifications) {
      await this.sendShareNotification(userId, dashboard, role);
    }
  }
  
  // Private helper methods
  
  private loadDefaultWidgets(): void {
    // Load built-in widget types
    const defaultWidgets = [
      'MetricWidget',
      'ChartWidget',
      'GaugeWidget',
      'TableWidget',
      'MapWidget',
      'TimelineWidget',
      'HeatmapWidget',
      'TreemapWidget',
      'SankeyWidget',
      'NetworkWidget',
      'FunnelWidget'
    ];
    
    // Register each widget type
    defaultWidgets.forEach(widgetType => {
      // Widget registration logic
    });
  }
  
  private startDataStreams(): void {
    // Initialize real-time data streams
    this.dataStreams.set('metrics', new DataStream('metrics'));
    this.dataStreams.set('logs', new DataStream('logs'));
    this.dataStreams.set('events', new DataStream('events'));
  }
  
  private initializeWebSocket(): void {
    // Initialize WebSocket server for real-time updates
    console.log('WebSocket server initialized');
  }
  
  private createDefaultLayout(): DashboardLayout {
    return {
      type: this.config.layout.type,
      grid: [],
      breakpoints: {
        mobile: 480,
        tablet: 768,
        desktop: 1024
      }
    };
  }
  
  private createDefaultMetrics(): DashboardMetrics {
    return {
      views: 0,
      uniqueViewers: 0,
      avgViewDuration: 0,
      widgetInteractions: new Map(),
      exportCount: 0,
      shareCount: 0,
      performance: {
        loadTime: 0,
        renderTime: 0,
        dataFetchTime: 0
      }
    };
  }
  
  private async applyTemplate(dashboard: Dashboard, template: string): Promise<void> {
    // Apply predefined template
    switch (template) {
      case 'overview':
        await this.applyOverviewTemplate(dashboard);
        break;
      
      case 'performance':
        await this.applyPerformanceTemplate(dashboard);
        break;
      
      case 'security':
        await this.applySecurityTemplate(dashboard);
        break;
      
      case 'compliance':
        await this.applyComplianceTemplate(dashboard);
        break;
    }
  }
  
  private async applyOverviewTemplate(dashboard: Dashboard): Promise<void> {
    // Add overview widgets
    await this.addWidget(dashboard.id, {
      type: 'metric',
      title: 'API Grade',
      dataSource: { type: 'api', endpoint: '/api/grade' }
    });
    
    await this.addWidget(dashboard.id, {
      type: 'chart',
      title: 'Grade Trend',
      dataSource: { type: 'api', endpoint: '/api/trends/grade' }
    });
    
    await this.addWidget(dashboard.id, {
      type: 'table',
      title: 'Top Issues',
      dataSource: { type: 'api', endpoint: '/api/issues' }
    });
  }
  
  private async applyPerformanceTemplate(dashboard: Dashboard): Promise<void> {
    // Add performance widgets
    await this.addWidget(dashboard.id, {
      type: 'gauge',
      title: 'Response Time',
      dataSource: { type: 'api', endpoint: '/api/metrics/response-time' }
    });
    
    await this.addWidget(dashboard.id, {
      type: 'chart',
      title: 'Throughput',
      dataSource: { type: 'api', endpoint: '/api/metrics/throughput' }
    });
  }
  
  private async applySecurityTemplate(dashboard: Dashboard): Promise<void> {
    // Add security widgets
    await this.addWidget(dashboard.id, {
      type: 'metric',
      title: 'Security Score',
      dataSource: { type: 'api', endpoint: '/api/security/score' }
    });
    
    await this.addWidget(dashboard.id, {
      type: 'heatmap',
      title: 'Vulnerability Matrix',
      dataSource: { type: 'api', endpoint: '/api/security/vulnerabilities' }
    });
  }
  
  private async applyComplianceTemplate(dashboard: Dashboard): Promise<void> {
    // Add compliance widgets
    await this.addWidget(dashboard.id, {
      type: 'metric',
      title: 'Compliance Rate',
      dataSource: { type: 'api', endpoint: '/api/compliance/rate' }
    });
    
    await this.addWidget(dashboard.id, {
      type: 'table',
      title: 'Compliance Gaps',
      dataSource: { type: 'api', endpoint: '/api/compliance/gaps' }
    });
  }
  
  private calculateAutoPosition(dashboard: Dashboard): Omit<GridPosition, 'widgetId'> {
    // Find first available position
    const occupied = new Set(
      dashboard.layout.grid.map(pos => `${pos.x},${pos.y}`)
    );
    
    for (let y = 0; y < this.config.layout.rows; y++) {
      for (let x = 0; x < this.config.layout.columns; x++) {
        if (!occupied.has(`${x},${y}`)) {
          return {
            x,
            y,
            width: 3,
            height: 2,
            resizable: true,
            draggable: true
          };
        }
      }
    }
    
    // Default to origin if no space
    return {
      x: 0,
      y: 0,
      width: 3,
      height: 2,
      resizable: true,
      draggable: true
    };
  }
  
  private startWidgetUpdates(widget: Widget): void {
    if (!widget.refreshRate) return;
    
    setInterval(async () => {
      await this.refreshWidgetData(widget);
    }, widget.refreshRate * 1000);
  }
  
  private async refreshWidgetData(widget: Widget): Promise<void> {
    const data = await this.fetchWidgetData(widget);
    
    // Update cache
    if (widget.dataSource.cache?.enabled) {
      this.cacheData(widget.id, data, widget.dataSource.cache.ttl);
    }
    
    // Broadcast update
    this.broadcastWidgetUpdate(widget.id, { ...widget, data });
  }
  
  private async fetchWidgetData(widget: Widget): Promise<any> {
    switch (widget.dataSource.type) {
      case 'api':
        return this.fetchFromAPI(widget.dataSource.endpoint!);
      
      case 'database':
        return this.fetchFromDatabase(widget.dataSource.query!);
      
      case 'stream':
        return this.fetchFromStream(widget.dataSource.endpoint!);
      
      case 'computed':
        return widget.dataSource.transformation!(null);
      
      default:
        return null;
    }
  }
  
  private async fetchFromAPI(endpoint: string): Promise<any> {
    // Simulate API fetch
    return { value: Math.random() * 100 };
  }
  
  private async fetchFromDatabase(query: string): Promise<any> {
    // Simulate database query
    return { rows: [] };
  }
  
  private async fetchFromStream(stream: string): Promise<any> {
    // Get latest from stream
    const dataStream = this.dataStreams.get(stream);
    return dataStream?.getLatest();
  }
  
  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl * 1000) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }
  
  private cacheData(key: string, data: any, ttl: number): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  
  private broadcastWidgetUpdate(widgetId: string, update: any): void {
    // Find dashboard containing widget
    let dashboardId: string | null = null;
    
    this.dashboards.forEach((dashboard, id) => {
      if (dashboard.widgets.some(w => w.id === widgetId)) {
        dashboardId = id;
      }
    });
    
    if (dashboardId) {
      this.notifyCollaborators(dashboardId, 'widget_update', update);
    }
  }
  
  private notifyCollaborators(
    dashboardId: string,
    event: string,
    data: any
  ): void {
    const collaborators = this.collaborators.get(dashboardId);
    if (!collaborators) return;
    
    const message = {
      event,
      data,
      timestamp: new Date()
    };
    
    collaborators.forEach(userId => {
      const connectionId = `${dashboardId}_${userId}`;
      const connection = this.connections.get(connectionId);
      
      if (connection && connection.readyState === WebSocket.OPEN) {
        connection.send(JSON.stringify(message));
      }
    });
  }
  
  private createWebSocketConnection(
    id: string,
    callback: (update: any) => void
  ): WebSocket {
    // Simulate WebSocket connection
    const ws = {} as WebSocket;
    
    // Mock implementation
    (ws as any).send = (data: string) => {
      callback(JSON.parse(data));
    };
    
    (ws as any).close = () => {
      // Cleanup
    };
    
    (ws as any).readyState = WebSocket.OPEN;
    
    return ws;
  }
  
  private createSSEConnection(
    id: string,
    callback: (update: any) => void
  ): void {
    // Server-sent events implementation
    console.log(`SSE connection created: ${id}`);
  }
  
  private async getUpdates(dashboardId: string): Promise<any> {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;
    
    // Collect all widget updates
    const updates = await Promise.all(
      dashboard.widgets.map(async widget => ({
        widgetId: widget.id,
        data: await this.getWidgetData(widget.id)
      }))
    );
    
    return updates;
  }
  
  private applyFilterToQuery(query: string, filter: Filter): string {
    // Apply filter to query string
    // Simplified implementation
    return `${query} WHERE ${filter.field} = '${filter.default}'`;
  }
  
  private async getMetricValue(dashboardId: string, metric: string): Promise<any> {
    // Get metric value from dashboard
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;
    
    // Find widget with metric
    const widget = dashboard.widgets.find(w => 
      w.config.metric === metric || w.title === metric
    );
    
    if (widget) {
      const data = await this.getWidgetData(widget.id);
      return data?.value || data;
    }
    
    return null;
  }
  
  private evaluateCondition(value: any, condition: AlertCondition): boolean {
    switch (condition.operator) {
      case 'gt':
        return value > condition.threshold;
      case 'gte':
        return value >= condition.threshold;
      case 'lt':
        return value < condition.threshold;
      case 'lte':
        return value <= condition.threshold;
      case 'eq':
        return value === condition.threshold;
      case 'neq':
        return value !== condition.threshold;
      case 'contains':
        return String(value).includes(String(condition.threshold));
      default:
        return false;
    }
  }
  
  private async sendEmailAlert(config: any, alert: Alert): Promise<void> {
    console.log(`Sending email alert: ${alert.name}`);
    // Email implementation
  }
  
  private async sendSlackAlert(config: any, alert: Alert): Promise<void> {
    console.log(`Sending Slack alert: ${alert.name}`);
    // Slack implementation
  }
  
  private async callWebhook(config: any, alert: Alert): Promise<void> {
    console.log(`Calling webhook: ${config.url}`);
    // Webhook implementation
  }
  
  private async sendNotification(
    config: any,
    alert: Alert,
    dashboardId: string
  ): Promise<void> {
    this.notifyCollaborators(dashboardId, 'alert', alert);
  }
  
  private broadcastAnnotation(widgetId: string, annotation: Annotation): void {
    // Find dashboard containing widget
    let dashboardId: string | null = null;
    
    this.dashboards.forEach((dashboard, id) => {
      if (dashboard.widgets.some(w => w.id === widgetId)) {
        dashboardId = id;
      }
    });
    
    if (dashboardId) {
      this.notifyCollaborators(dashboardId, 'annotation_added', annotation);
    }
  }
  
  private async exportToPDF(dashboard: Dashboard, widgetData: any[]): Promise<Buffer> {
    // PDF export implementation
    console.log(`Exporting dashboard ${dashboard.id} to PDF`);
    return Buffer.from('PDF content');
  }
  
  private async exportToPNG(dashboard: Dashboard, widgetData: any[]): Promise<Buffer> {
    // PNG export implementation
    console.log(`Exporting dashboard ${dashboard.id} to PNG`);
    return Buffer.from('PNG content');
  }
  
  private async exportToCSV(dashboard: Dashboard, widgetData: any[]): Promise<Buffer> {
    // CSV export implementation
    const csv = widgetData.map(wd => 
      `${wd.widget.title},${JSON.stringify(wd.data)}`
    ).join('\n');
    
    return Buffer.from(csv);
  }
  
  private async sendShareNotification(
    userId: string,
    dashboard: Dashboard,
    role: string
  ): Promise<void> {
    console.log(`Dashboard ${dashboard.name} shared with ${userId} as ${role}`);
    // Notification implementation
  }
  
  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Supporting classes

class DataStream {
  private buffer: any[] = [];
  private maxSize: number = 1000;
  
  constructor(private name: string) {}
  
  push(data: any): void {
    this.buffer.push({
      data,
      timestamp: Date.now()
    });
    
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }
  
  getLatest(): any {
    return this.buffer[this.buffer.length - 1]?.data;
  }
  
  getBuffer(): any[] {
    return [...this.buffer];
  }
}

interface CachedData {
  data: any;
  timestamp: number;
  ttl: number;
}