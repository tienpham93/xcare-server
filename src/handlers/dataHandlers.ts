import { AuthService } from "../services/authService";
import { Request, Response } from 'express';
import { logger } from "../utils/logger";
import { UserCredential } from "../types";
import prisma from "../services/prismaClient";

export const postLoginHandler = async (req: Request, res: Response): Promise<void> => {
    const { username, password } = req.body;
    const authService = new AuthService(username, password);

    try {
        const userData = await authService.getUserDataAndToken();
        res.json(userData);
    } catch (error) {
        res.status(401).json({ error: 'Invalid credentials' });
    }
};

export const getUserHandler = async (req: Request, res: Response): Promise<void> => {
    const { username } = req.query;
    try {
        const dbUser = await prisma.user.findUnique({
            where: { username: username as string },
        });

        if (!dbUser) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        // Strip password from response
        const { password, ...userMetadata } = dbUser;
        res.json({ ...userMetadata, credentials: {} as UserCredential });
    } catch (error) {
        logger.error('getUserHandler error:', error);
        res.status(500).json({ error: 'Server error' });
    }
};

export const getTicketsHandler = async (req: Request, res: Response): Promise<void> => {
    const authService = new AuthService();
    const authToken = req.headers.authorization;
    const { createdBy } = req.query;

    if (!authToken || !authService.verifyTokenFromHeader(authToken)) {
        logger.error('Unauthorized request');
        res.status(401).json({ error: 'Unauthorized request' });
        return;
    }

    try {
        const tickets = await prisma.ticket.findMany({
            where: { createdBy: createdBy as string },
            orderBy: { createdDate: 'desc' },
        });
        res.json(tickets);
    } catch (error) {
        logger.error('getTicketsHandler error:', error);
        res.status(404).json({ error: 'Tickets not found' });
    }
};

export const postTicketHandler = async (req: Request, res: Response): Promise<void> => {
    const { title, content, createdBy, email } = req.body;

    try {
        const newTicket = await prisma.ticket.create({
            data: {
                title,
                content,
                createdBy,
                email,
                status: 'Open',
            },
        });
        res.json(newTicket);
    } catch (error) {
        logger.error('postTicketHandler error:', error);
        res.status(500).json({ error: 'Failed to create ticket' });
    }
};

export const postAnalyticHandler = async (req: Request, res: Response): Promise<void> => {
    const { conversation, vote, evalMetadata } = req.body;
    try {
        const newVote = await prisma.analytic.create({
            data: {
                userMessage: conversation.user,
                botMessage: conversation.bot,
                vote: vote,
                evalMetadata: evalMetadata ?? {},
            },
        });
        res.json(newVote);
    } catch (error) {
        logger.error('postAnalyticHandler error:', error);
        res.status(500).json({ error: 'Failed to save vote data' });
    }
};

export const postMonitoringHandler = async (req: Request, res: Response): Promise<void> => {
    const { conversation, isManIntervention, evalMetadata } = req.body;

    try {
        const newMonitorData = await prisma.monitoring.create({
            data: {
                userMessage: conversation.user,
                botMessage: conversation.bot,
                isManIntervention: isManIntervention,
                evalMetadata: evalMetadata ?? {},
            },
        });
        res.json(newMonitorData);
    } catch (error) {
        logger.error('postMonitoringHandler error:', error);
        res.status(500).json({ error: 'Failed to save monitoring data' });
    }
};