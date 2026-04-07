/**
 * Seed script — Migrates existing JSON flat-file data into PostgreSQL.
 * Run once: `bun run prisma/seed.ts`
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/xcare?schema=public',
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log('🌱 Seeding database from JSON files...');

    // ── Users ──────────────────────────────────────────────────────────────
    const usersRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, './seeds/data/userData.json'), 'utf-8')
    );
    for (const u of usersRaw) {
        await prisma.user.upsert({
            where: { username: u.username },
            update: {},
            create: {
                fullname: u.fullName,
                username: u.username,
                password: u.credentials?.password || '',
                gender: u.gender,
                age: String(u.age),
                email: u.email,
                user_type: u.user_type,
            },
        });
    }
    console.log(`  ✅ Seeded ${usersRaw.length} users`);

    // ── Tickets ────────────────────────────────────────────────────────────
    const ticketsRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, './seeds/data/ticketsData.json'), 'utf-8')
    );

    // Get all valid usernames to avoid FK violations
    const existingUsers = await prisma.user.findMany({ select: { username: true } });
    const validUsernames = new Set(existingUsers.map(u => u.username));

    for (const t of ticketsRaw) {
        const createdBy = validUsernames.has(t.createdBy) ? t.createdBy : null;
        await prisma.ticket.create({
            data: {
                title: t.title,
                content: t.content || '',
                createdBy,
                email: t.email || null,
                status: t.status || 'Open',
                createdDate: t.createdDate ? new Date(t.createdDate) : new Date(),
            },
        });
    }
    console.log(`  ✅ Seeded ${ticketsRaw.length} tickets`);

    // ── Analytics ──────────────────────────────────────────────────────────
    const analyticsRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, './seeds/data/analyticData.json'), 'utf-8')
    );
    for (const a of analyticsRaw) {
        await prisma.analytic.create({
            data: {
                userMessage: a.conversation?.user || '',
                botMessage: a.conversation?.bot || '',
                vote: a.vote || '',
                evalMetadata: a.evalMetadata ?? {},
            },
        });
    }
    console.log(`  ✅ Seeded ${analyticsRaw.length} analytics`);

    // ── Monitoring ─────────────────────────────────────────────────────────
    const monitorRaw = JSON.parse(
        fs.readFileSync(path.join(__dirname, './seeds/data/monitoringData.json'), 'utf-8')
    );
    for (const m of monitorRaw) {
        await prisma.monitoring.create({
            data: {
                userMessage: m.conversation?.user || '',
                botMessage: m.conversation?.bot || '',
                isManIntervention: m.isManIntervention ?? false,
                evalMetadata: m.evalMetadata ?? {},
            },
        });
    }
    console.log(`  ✅ Seeded ${monitorRaw.length} monitoring records`);

    // ── Knowledge Base (Rules & Embeddings) ──────────────────────────────
    const { KnowledgeBase } = await import('../src/services/RAGservice/knowledgeBase.js');
    const kb = KnowledgeBase.getInstance();
    await kb.initializeKnowledgeBase(path.join(__dirname, './seeds/knowledge'));
    console.log('  ✅ Seeded Hybrid Knowledge Base (Rules & Embeddings)');

    console.log('🌱 Seed complete!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await pool.end();
    });
