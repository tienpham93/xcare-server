import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { BotResult } from '../../../src/types';

/**
 * Promptfoo Types (Simplified)
 */
export interface ProviderResponse {
  output?: any;
  error?: string;
  metadata?: Record<string, any>;
}

export interface CallApiContext {
  vars: Record<string, any>;
}

/**
 * Promptfoo Provider for XCare Assistant.
 * Bridges Promptfoo to our LangGraph AgentGraph via the /agent/generate endpoint.
 */
class XCareProvider {
  url: string;
  token: string;

  constructor(options: any = {}) {
    this.url = options.url || 'http://localhost:5002/agent/generate';
    
    // Generate a valid JWT token for the eval session
    // Using the secret from src/services/authService.ts
    const jwtSecret = '11223355'; 
    this.token = jwt.sign({ username: 'eval-user' }, jwtSecret, { expiresIn: '1h' });
  }

  id() {
    return 'xcare-assistant';
  }

  async callApi(promptText: string, context: CallApiContext): Promise<ProviderResponse> {
    try {
      const vars = context?.vars || {};
      const username = vars.username || 'eval-user';
      // promptText is the rendered template; fall back to vars.request if template wasn't resolved
      const message = promptText && promptText.trim() ? promptText : (vars.request || '');
      
      const response = await axios.post(this.url, {
        prompt: message,
        username: username,
        messageType: 'general',
        sessionId: 'eval-session'
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}` // Required by ollamaHandlers.ts
        }
      });

      // Server returns { sessionId, conversation: { message: [...] }, debug: { ... } }
      const data = response.data;
      const botMessage = data.conversation.message.find((m: any) => m.role === 'bot');
      const debugInfo = data.debug || {};

      // Parse the content between *** markers into a BotResult object
      let parsedOutput: BotResult | any = 'No response from bot';
      if (botMessage) {
        const content = botMessage.content;
        const match = content.match(/\*\*\*([\s\S]*?)\*\*\*/);
        if (match) {
          try {
            parsedOutput = JSON.parse(match[1]);
          } catch (e) {
            parsedOutput = { answer: content, error: 'Failed to parse JSON inside ***' };
          }
        } else {
          parsedOutput = { answer: content, error: 'No *** markers found' };
        }
      }

      return {
        output: parsedOutput,
        metadata: {
          intent: debugInfo.intent,
          domains: debugInfo.domains,
          contextStatus: debugInfo.contextStatus,
          retrievalCount: debugInfo.retrievalCount || 0,
          relevanceScore: debugInfo.relevanceScore || 0
        }
      };
    } catch (error: any) {
      const errorDetail = error.response?.data?.error || error.message;
      console.error('XCare Provider Error:', errorDetail);
      return {
        error: `Failed to call XCare API: ${errorDetail}`
      };
    }
  }
}

export default XCareProvider;
