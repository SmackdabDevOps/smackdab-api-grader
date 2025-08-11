import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as pipeline from '../app/pipeline.js';
import { GraderDB } from './persistence/db.js';

// Create MCP server instance
const mcpServer = new McpServer({
  name: 'smackdab-api-grader',
  version: '1.2.0',
  description: 'Grades OpenAPI specifications against Smackdab standards'
});

// Helper for progress notifications
function progress(stage: string, pct: number, note?: string) {
  // Progress notifications can be sent via the server if needed
  // Only log in debug mode to avoid stderr interference
  if (process.env.DEBUG === 'true') {
    console.error(`Progress: ${stage} - ${pct}% ${note || ''}`);
  }
}

// Register tools
mcpServer.registerTool('version', {
  description: 'Get grader version information',
  inputSchema: {}
}, async () => {
  const version = await pipeline.version();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(version, null, 2)
    }]
  };
});

mcpServer.registerTool('list_checkpoints', {
  description: 'List all grading checkpoints',
  inputSchema: {}
}, async () => {
  const checkpoints = await pipeline.listCheckpoints();
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(checkpoints, null, 2)
    }]
  };
});

mcpServer.registerTool('grade_contract', {
  description: 'Grade an OpenAPI specification file',
  inputSchema: {
    path: z.string().describe('Path to the OpenAPI file'),
    templatePath: z.string().optional().describe('Optional path to template file')
  }
}, async ({ path, templatePath }) => {
  try {
    const result = await pipeline.gradeContract({ path, templatePath }, { progress });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error grading contract: ${error.message}`
      }],
      isError: true
    };
  }
});

mcpServer.registerTool('grade_inline', {
  description: 'Grade inline OpenAPI YAML content',
  inputSchema: {
    content: z.string().describe('OpenAPI YAML content'),
    templatePath: z.string().optional().describe('Optional path to template file')
  }
}, async ({ content, templatePath }) => {
  try {
    const result = await pipeline.gradeInline({ content, templatePath }, { progress });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error grading inline content: ${error.message}`
      }],
      isError: true
    };
  }
});

mcpServer.registerTool('grade_and_record', {
  description: 'Grade an API and record results to database',
  inputSchema: {
    path: z.string().describe('Path to the OpenAPI file'),
    templatePath: z.string().optional().describe('Optional path to template file')
  }
}, async ({ path, templatePath }) => {
  try {
    const result = await pipeline.gradeAndRecord({ path, templatePath }, { progress });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error grading and recording: ${error.message}`
      }],
      isError: true
    };
  }
});

mcpServer.registerTool('explain_finding', {
  description: 'Get detailed explanation for a specific rule violation',
  inputSchema: {
    ruleId: z.string().describe('Rule ID to explain')
  }
}, async ({ ruleId }) => {
  try {
    const explanation = await pipeline.explainFinding({ ruleId });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(explanation, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error explaining finding: ${error.message}`
      }],
      isError: true
    };
  }
});

mcpServer.registerTool('suggest_fixes', {
  description: 'Suggest fixes for API violations',
  inputSchema: {
    path: z.string().describe('Path to the OpenAPI file')
  }
}, async ({ path }) => {
  try {
    const fixes = await pipeline.suggestFixes({ path });
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(fixes, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error suggesting fixes: ${error.message}`
      }],
      isError: true
    };
  }
});

mcpServer.registerTool('get_api_history', {
  description: 'Get grading history for an API',
  inputSchema: {
    apiId: z.string().describe('API identifier'),
    limit: z.number().optional().describe('Maximum number of results'),
    since: z.string().optional().describe('Get results since this date')
  }
}, async ({ apiId, limit, since }) => {
  try {
    const db = new GraderDB();
    await db.connect();
    await db.migrate();
    const rows = await db.getHistory(apiId, limit ?? 20, since);
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({ apiId, rows }, null, 2)
      }]
    };
  } catch (error: any) {
    return {
      content: [{
        type: 'text',
        text: `Error getting API history: ${error.message}`
      }],
      isError: true
    };
  }
});

// Main function to start the server
async function main() {
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
  // Only log startup message in debug mode
  if (process.env.DEBUG === 'true') {
    console.error('Smackdab API Grader MCP server running...');
  }
}

// Start the server
main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});