import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Extend Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        teamId: string;
        userId: string;
        apiKey: string;
      };
    }
  }
}

// In production, these would come from a database
// For now, using environment variables
const API_KEYS = new Map<string, { teamId: string; userId: string }>();

// Initialize API keys from environment
function initializeApiKeys() {
  const keysJson = process.env.API_KEYS || '{}';
  console.log('Initializing API keys from environment:', keysJson);
  try {
    const keys = JSON.parse(keysJson);
    Object.entries(keys).forEach(([apiKey, data]: [string, any]) => {
      API_KEYS.set(apiKey, {
        teamId: data.teamId,
        userId: data.userId
      });
      console.log(`Added API key: ${apiKey.substring(0, 10)}...`);
    });
    console.log(`Total API keys loaded: ${API_KEYS.size}`);
  } catch (error) {
    console.error('Failed to parse API_KEYS:', error);
    // Add a default key for development
    if (process.env.NODE_ENV !== 'production') {
      const devKey = 'dev_' + crypto.randomBytes(16).toString('hex');
      API_KEYS.set(devKey, {
        teamId: 'dev-team',
        userId: 'dev-user'
      });
      console.log(`Development API key: ${devKey}`);
    }
  }
}

// Initialize on module load
initializeApiKeys();

// Rate limiting map (in production, use Redis)
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = parseInt(process.env.RATE_LIMIT || '100'); // requests per minute
const RATE_WINDOW = 60000; // 1 minute in milliseconds

export function authenticateRequest(req: Request, res: Response, next: NextFunction) {
  // Extract API key from headers
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const apiKey = authHeader.substring(7);
  
  // Validate API key
  const keyData = API_KEYS.get(apiKey);
  if (!keyData) {
    return res.status(401).json({ error: 'Invalid API key' });
  }

  // Check rate limit
  const now = Date.now();
  const limit = rateLimits.get(keyData.teamId);
  
  if (limit) {
    if (now < limit.resetTime) {
      if (limit.count >= RATE_LIMIT) {
        const retryAfter = Math.ceil((limit.resetTime - now) / 1000);
        res.setHeader('Retry-After', retryAfter.toString());
        return res.status(429).json({ 
          error: 'Rate limit exceeded',
          retryAfter 
        });
      }
      limit.count++;
    } else {
      // Reset window
      limit.count = 1;
      limit.resetTime = now + RATE_WINDOW;
    }
  } else {
    // First request
    rateLimits.set(keyData.teamId, {
      count: 1,
      resetTime: now + RATE_WINDOW
    });
  }

  // Attach user data to request
  req.user = {
    teamId: keyData.teamId,
    userId: keyData.userId,
    apiKey
  };

  next();
}

// Helper to generate new API keys
export function generateApiKey(teamId: string, userId: string): string {
  const key = 'sk_' + crypto.randomBytes(24).toString('hex');
  API_KEYS.set(key, { teamId, userId });
  return key;
}

// Helper to revoke API keys
export function revokeApiKey(apiKey: string): boolean {
  return API_KEYS.delete(apiKey);
}

// Helper to list keys for a team (returns masked keys)
export function listTeamKeys(teamId: string): string[] {
  const keys: string[] = [];
  API_KEYS.forEach((data, key) => {
    if (data.teamId === teamId) {
      // Mask the key for security
      keys.push(key.substring(0, 7) + '...' + key.substring(key.length - 4));
    }
  });
  return keys;
}

// Export for use in other modules
export function getApiKeys(): Map<string, { teamId: string; userId: string }> {
  return API_KEYS;
}