import { Request, Response } from 'express';
import { logger } from "../utils/logger";
import prisma from "../services/prismaClient";
import path from 'path';

/**
 * GET /agent/knowledge
 * Returns all structured knowledge rules for auditing and management.
 */
export const getKnowledgeRules = async (req: Request, res: Response): Promise<void> => {
    try {
        const rules = await prisma.knowledgeRule.findMany({
            orderBy: { createdAt: 'desc' }
        });
        res.json(rules);
    } catch (error) {
        logger.error('getKnowledgeRules error:', error);
        res.status(500).json({ error: 'Failed to fetch knowledge rules' });
    }
};

/**
 * POST /agent/knowledge
 * Creates a new structured knowledge rule.
 */
export const postKnowledgeRule = async (req: Request, res: Response): Promise<void> => {
    const { topic, category, content, strictAnswer, isManIntervention, nextTopic, metadata } = req.body;
    try {
        const newRule = await prisma.knowledgeRule.create({
            data: {
                topic,
                category,
                content,
                strictAnswer,
                isManIntervention: isManIntervention ?? false,
                nextTopic,
                metadata: metadata ?? {},
            },
        });
        res.json(newRule);
    } catch (error) {
        logger.error('postKnowledgeRule error:', error);
        res.status(500).json({ error: 'Failed to create knowledge rule' });
    }
};

/**
 * PATCH /agent/knowledge/:id
 * Updates an existing knowledge rule.
 */
export const patchKnowledgeRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const updateData = req.body;
    try {
        const updatedRule = await prisma.knowledgeRule.update({
            where: { id: Number(id) },
            data: updateData
        });
        res.json(updatedRule);
    } catch (error) {
        logger.error('patchKnowledgeRule error:', error);
        res.status(500).json({ error: 'Failed to update knowledge rule' });
    }
};

/**
 * DELETE /agent/knowledge/:id
 * Deletes a knowledge rule.
 */
export const deleteKnowledgeRule = async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    try {
        await prisma.knowledgeRule.delete({
            where: { id: Number(id) }
        });
        res.json({ success: true });
    } catch (error) {
        logger.error('deleteKnowledgeRule error:', error);
        res.status(500).json({ error: 'Failed to delete knowledge rule' });
    }
};

/**
 * POST /agent/knowledge/reinitialize
 * Triggers a full re-ingestion of the knowledge base (Structured Rules + Vector Embeddings).
 */
export const reinitializeKnowledgeHandler = async (req: Request, res: Response): Promise<void> => {
    try {
        const { KnowledgeBase } = await import('../services/RAGservice/knowledgeBase.js');
        const kb = KnowledgeBase.getInstance();
        const knowledgePath = path.join(__dirname, '../../prisma/seeds/knowledge');
        
        await kb.initializeKnowledgeBase(knowledgePath);
        
        res.json({ success: true, message: 'Knowledge base re-initialized successfully' });
    } catch (error) {
        logger.error('reinitializeKnowledgeHandler error:', error);
        res.status(500).json({ error: 'Failed to re-initialize knowledge base' });
    }
};
