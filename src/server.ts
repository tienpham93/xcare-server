import { OllamaService } from './services/ollamaService';
import { logger } from './utils/logger';
import express from 'express';
import router from './router';
import { ollamaPort, expressPort } from './env';
import { KnowledgeBase } from './services/RAGservice/knowledgeBase';

const app = express();
export const ollamaHost = `http://127.0.0.1:${ollamaPort}`;
export const serverHost = `http://localhost:${expressPort}`;

// Initialize the Ollama service
export const ollamaService = new OllamaService(ollamaHost);

// Initialize RAG service
export const knowledgeBase = KnowledgeBase.getInstance();

app.use(express.json());

// Initialize the agent
(async () => {
    try {
        await ollamaService.initialize();
        await knowledgeBase.initializeKnowledgeBase('./src/knowledge');

        logger.info('The Agent initialized successfully (Ollama + LangChain RAG)');
    } catch (error) {
        logger.error('Failed to initialize the Agent:', error);
        process.exit(1);
    }
})();

app.use(router);
app.listen(expressPort, () => {    
    logger.info(`Express is running at ${serverHost}`);
    logger.info(`Model ${ollamaService.modelConfig.name} is running at localhost:${ollamaPort}`);
});