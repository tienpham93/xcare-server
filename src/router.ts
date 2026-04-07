import express from 'express';
import { postGenerateHandler } from './handlers/ollamaHandlers';
import { getTicketsHandler, getUserHandler, postAnalyticHandler, postLoginHandler, postTicketHandler, postMonitoringHandler } from './handlers/dataHandlers';
import { getKnowledgeRules, postKnowledgeRule, patchKnowledgeRule, deleteKnowledgeRule, reinitializeKnowledgeHandler } from './handlers/knowledgeHandlers';

const router = express.Router();

router.post('/agent/generate', postGenerateHandler);

router.post('/agent/login', postLoginHandler);
router.get('/agent/user', getUserHandler);

router.get('/agent/tickets', getTicketsHandler);
router.post('/agent/submit', postTicketHandler);
router.post('/agent/analytic', postAnalyticHandler);
router.post('/agent/monitoring', postMonitoringHandler);

// Knowledge Base Management (Hybrid Rule + Vector)
router.get('/agent/knowledge', getKnowledgeRules);
router.post('/agent/knowledge', postKnowledgeRule);
router.patch('/agent/knowledge/:id', patchKnowledgeRule);
router.delete('/agent/knowledge/:id', deleteKnowledgeRule);
router.post('/agent/knowledge/reinitialize', reinitializeKnowledgeHandler);

export default router;