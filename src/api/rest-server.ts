/**
 * REST API Server for Render Deployment
 * 
 * This is a standard Express REST API that the MCP client connects to.
 * It provides all the grading functionality without MCP protocol complexity.
 */

import express from 'express';
import cors from 'cors';
import * as pipeline from '../app/pipeline.js';
import { generateApiId, validateApiIdFormat, getApiIdInstructions } from '../mcp/tools/api-id-generator.js';
import { GraderDB } from '../mcp/persistence/db.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-MCP-Client'],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.text({ limit: '10mb' }));

// Simple auth middleware
function checkAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Allow health and version endpoints without auth
  if (req.path === '/health' || req.path === '/api/version') {
    return next();
  }
  
  const auth = req.headers.authorization;
  
  // Check for API keys from environment (can be JSON string or single key)
  let validKeys: Set<string> = new Set();
  
  if (process.env.API_KEYS) {
    // Parse JSON object of keys
    try {
      const keys = JSON.parse(process.env.API_KEYS);
      Object.keys(keys).forEach(k => validKeys.add(k));
    } catch {
      // If not JSON, treat as single key
      validKeys.add(process.env.API_KEYS);
    }
  } else if (process.env.API_KEY) {
    // Single API key
    validKeys.add(process.env.API_KEY);
  } else {
    // Default key for testing
    validKeys.add('sk_prod_001');
  }
  
  const providedKey = auth?.replace('Bearer ', '');
  if (!providedKey || !validKeys.has(providedKey)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
}

// Apply auth to all routes
app.use(checkAuth);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    version: '2.0.0',
    type: 'rest-api',
    timestamp: new Date().toISOString()
  });
});

// API Version
app.post('/api/version', async (req, res) => {
  res.json({
    version: '2.0.0',
    grader: 'smackdab-api-grader',
    type: 'rest-api',
    capabilities: [
      'grade_contract',
      'generate_api_id',
      'validate_api_id',
      'get_api_history',
      'get_api_improvements',
      'compare_api_versions',
      'get_api_analytics'
    ]
  });
});

// List Checkpoints
app.post('/api/checkpoints', async (req, res) => {
  try {
    const checkpoints = await pipeline.listCheckpoints();
    res.json(checkpoints);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Grade Contract
app.post('/api/grade', async (req, res) => {
  try {
    const { content, isUrl, templatePath } = req.body;
    
    let yamlContent: string;
    if (isUrl) {
      const response = await fetch(content);
      yamlContent = await response.text();
    } else {
      yamlContent = content;
    }
    
    const template = templatePath || process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
    
    const progressCallback = (stage: string, percent: number, note?: string) => {
      console.log(`[${percent}%] ${stage}: ${note || ''}`);
    };
    
    const result = await pipeline.gradeInline(
      { content: yamlContent, templatePath: template },
      { progress: progressCallback }
    );
    
    res.json(result);
  } catch (error: any) {
    console.error('Grade error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate API ID
app.post('/api/generate-id', async (req, res) => {
  try {
    const { organization, domain, type } = req.body;
    const apiId = generateApiId({ organization, domain, type });
    const instructions = getApiIdInstructions(apiId);
    
    res.json({
      apiId,
      instructions,
      format: 'UUID v4',
      usage: 'Add as x-api-id in your OpenAPI info section'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Validate API ID
app.post('/api/validate-id', async (req, res) => {
  try {
    const { content } = req.body;
    const { parseDocument } = await import('yaml');
    const doc = parseDocument(content);
    const spec = doc.toJS();
    
    const apiId = spec?.info?.['x-api-id'];
    const isValid = apiId && validateApiIdFormat(apiId);
    
    res.json({
      hasApiId: !!apiId,
      apiId: apiId || null,
      isValid,
      message: isValid ? 'Valid x-api-id found' : 'Missing or invalid x-api-id'
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get API History
app.post('/api/history', async (req, res) => {
  try {
    const { apiUuid } = req.body;
    const db = new GraderDB();
    const history = await db.getApiHistory(apiUuid);
    
    res.json({
      apiId: apiUuid,
      totalGrades: history.length,
      history: history.map((h: any) => ({
        timestamp: h.timestamp,
        score: h.totalScore,
        grade: h.finalGrade,
        version: h.apiVersion
      }))
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get API Improvements
app.post('/api/improvements', async (req, res) => {
  try {
    const { apiUuid } = req.body;
    const db = new GraderDB();
    const history = await db.getApiHistory(apiUuid);
    
    if (history.length < 2) {
      return res.json({
        message: 'Not enough history to calculate improvements (need at least 2 grades)'
      });
    }
    
    const latest = history[history.length - 1];
    const baseline = history[0];
    
    res.json({
      apiId: apiUuid,
      improvements: {
        scoreChange: latest.totalScore - baseline.totalScore,
        gradeChange: `${baseline.finalGrade} -> ${latest.finalGrade}`,
        improvementRate: ((latest.totalScore - baseline.totalScore) / baseline.totalScore * 100).toFixed(2) + '%',
        gradesAnalyzed: history.length
      },
      summary: `API improved from ${baseline.finalGrade} (${baseline.totalScore}) to ${latest.finalGrade} (${latest.totalScore})`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Compare API Versions
app.post('/api/compare', async (req, res) => {
  try {
    const { baselineContent, candidateContent } = req.body;
    
    const templatePath = process.env.TEMPLATE_PATH || '/app/templates/MASTER_API_TEMPLATE_v3.yaml';
    const progressCallback = (stage: string, percent: number) => {
      console.log(`[${percent}%] ${stage}`);
    };
    
    // Grade both versions
    const [baselineGrade, candidateGrade] = await Promise.all([
      pipeline.gradeInline({ content: baselineContent, templatePath }, { progress: progressCallback }),
      pipeline.gradeInline({ content: candidateContent, templatePath }, { progress: progressCallback })
    ]);
    
    const comparison = {
      baseline: {
        score: baselineGrade.totalScore,
        grade: baselineGrade.finalGrade,
        passed: baselineGrade.checkpointsPassed,
        failed: baselineGrade.checkpointsFailed
      },
      candidate: {
        score: candidateGrade.totalScore,
        grade: candidateGrade.finalGrade,
        passed: candidateGrade.checkpointsPassed,
        failed: candidateGrade.checkpointsFailed
      },
      improvement: {
        score: candidateGrade.totalScore - baselineGrade.totalScore,
        grade: `${baselineGrade.finalGrade} -> ${candidateGrade.finalGrade}`,
        passedDelta: candidateGrade.checkpointsPassed - baselineGrade.checkpointsPassed
      }
    };
    
    res.json({
      comparison,
      summary: `Version comparison: ${comparison.improvement.grade} (${comparison.improvement.score > 0 ? '+' : ''}${comparison.improvement.score} points)`
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get API Analytics
app.post('/api/analytics', async (req, res) => {
  try {
    const { apiUuid } = req.body;
    const db = new GraderDB();
    const history = await db.getApiHistory(apiUuid);
    
    if (history.length === 0) {
      return res.json({
        message: 'No grading history found for this API'
      });
    }
    
    const scores = history.map((h: any) => h.totalScore);
    const grades = history.map((h: any) => h.finalGrade);
    
    res.json({
      apiId: apiUuid,
      metrics: {
        averageScore: (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(2),
        maxScore: Math.max(...scores),
        minScore: Math.min(...scores),
        currentScore: scores[scores.length - 1],
        totalGrades: history.length,
        uniqueGrades: [...new Set(grades)],
        trend: scores[scores.length - 1] > scores[0] ? 'improving' : 
               scores[scores.length - 1] < scores[0] ? 'declining' : 'stable'
      },
      timeline: {
        firstGraded: history[0].timestamp,
        lastGraded: history[history.length - 1].timestamp,
        grades: history.map((h: any) => ({
          date: h.timestamp,
          score: h.totalScore,
          grade: h.finalGrade
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} does not exist`,
    availableEndpoints: [
      'GET /health',
      'POST /api/version',
      'POST /api/checkpoints',
      'POST /api/grade',
      'POST /api/generate-id',
      'POST /api/validate-id',
      'POST /api/history',
      'POST /api/improvements',
      'POST /api/compare',
      'POST /api/analytics'
    ]
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`REST API Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base: http://localhost:${PORT}/api`);
  console.log('Ready to accept requests from MCP clients');
});