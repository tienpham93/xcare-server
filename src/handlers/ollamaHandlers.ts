import { Request, Response } from 'express';
import { OllamaResponse } from '../types';
import { logger } from '../utils/logger';
import { ollamaService, serverHost } from '../server';
import { AuthService } from '../services/authService';
import { parseAnswer } from '../utils/stringFormat';
import { agentGraph } from '../services/graph/agentGraph';

export const postGenerateHandler = async (
    req: Request,
    res: Response
) => {
    const { model, prompt, sessionId = 'greeting', messageType = 'general', username } = req.body;
    
    // Verify Auth Token
    const authService = new AuthService();
    const authToken = req.headers.authorization;

    if (authToken) {
        if (!authService.verifyTokenFromHeader(authToken)) {
            logger.error('Unauthorized request');
            res.status(401).json({ error: 'Unauthorized request' });
            return;
        }
    } else {
        logger.error('Unauthorized request');
        res.status(401).json({ error: 'Unauthorized request' });
        return;
    }

    // Handle Prompt
    try {
        if (model) {
            ollamaService.setModel(model);
        }

        // Invoke LangGraph Agent
        const graphResult = await agentGraph.invoke({
            question: prompt,
            username: username || 'anonymous',
            messageType: messageType,
            history: [], // We can expand this for multi-turn later
        }, {
            configurable: {
                llm: ollamaService['llm'] // Direct access for the graph
            }
        });

        const response = graphResult.generation;
        const evalMetadata = graphResult.evalMetadata;

        let botResponse: OllamaResponse = {
            model: ollamaService.modelConfig.name,
            message: [
                {
                    role: 'user',
                    content: prompt
                }, {
                    role: 'bot',
                    content: response
                }
            ],
            metadata: {
                currentState: 'langgraph_managed',
                sessionData: evalMetadata // Include rich metadata for the evaluator
            },
        }

        // Check if the bot response requires human intervention (via Graph metadata)
        if (evalMetadata.requiresHumanIntervention) {
            logger.info('Bot request human intervention (via graph)');
            const parsed = parseAnswer(response);
            await fetch(`${serverHost}/agent/monitoring`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation: {
                        user: prompt,
                        bot: parsed.answer
                    },
                    isManIntervention: true,
                    evalMetadata: evalMetadata // Pass along the audit trail
                })
            });
        };

        logger.info('Bot response generated via LangGraph');
        res.json({
            sessionId: sessionId,
            conversation: botResponse,
            debug: evalMetadata // New field for professional evaluation
        });
    } catch (error) {
        logger.error('Failed to prompt via LangGraph:', error);
        res.status(500).json({ error: 'Failed to prompt' });
    };
};