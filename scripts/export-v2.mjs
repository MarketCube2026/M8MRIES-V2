import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const outputDirectory = path.resolve(process.argv[2] || `backups/v2-${new Date().toISOString().replace(/[:.]/g, '-')}`);
const prisma = new PrismaClient();

const readers = {
  applications: () => prisma.application.findMany({ orderBy: { id: 'asc' } }),
  attachments: () => prisma.attachment.findMany({ orderBy: { id: 'asc' } }),
  extractedFields: () => prisma.extractedField.findMany({ orderBy: { id: 'asc' } }),
  scoreBreakdowns: () => prisma.scoreBreakdown.findMany({ orderBy: { id: 'asc' } }),
  evaluations: () => prisma.evaluation.findMany({ orderBy: { id: 'asc' } }),
  approvals: () => prisma.approval.findMany({ orderBy: { id: 'asc' } }),
  ledgerEntries: () => prisma.ledgerEntry.findMany({ orderBy: { id: 'asc' } }),
  postEventReviews: () => prisma.postEventReview.findMany({ orderBy: { id: 'asc' } }),
  auditLogs: () => prisma.auditLog.findMany({ orderBy: { id: 'asc' } }),
  ruleOptions: () => prisma.ruleOption.findMany({ orderBy: { id: 'asc' } }),
  amountBands: () => prisma.amountBand.findMany({ orderBy: { id: 'asc' } }),
  ocrRuns: () => prisma.ocrRun.findMany({ orderBy: { id: 'asc' } }),
  userAccess: () => prisma.userAccess.findMany({ orderBy: { userId: 'asc' } }),
};

const manifest = {
  createdAt: new Date().toISOString(),
  tables: {},
};

try {
  await fs.mkdir(outputDirectory, { recursive: true });
  for (const [name, read] of Object.entries(readers)) {
    const rows = await read();
    const contents = JSON.stringify(rows, null, 2);
    const fileName = `${name}.json`;
    await fs.writeFile(path.join(outputDirectory, fileName), contents, { mode: 0o600 });
    manifest.tables[name] = {
      count: rows.length,
      fileName,
      sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    };
  }
  await fs.writeFile(path.join(outputDirectory, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ outputDirectory, counts: Object.fromEntries(Object.entries(manifest.tables).map(([name, table]) => [name, table.count])) }));
} finally {
  await prisma.$disconnect();
}
