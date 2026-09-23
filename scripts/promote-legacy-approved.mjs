import 'dotenv/config';
import fs from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';
import { mapLegacy } from './legacy-map.mjs';
import { parseLegacyInput } from './legacy-input.mjs';

const args = process.argv.slice(2);
const input = args.find(arg => !arg.startsWith('--'));
if (!input) throw new Error('用法: npm run migrate:promote-legacy -- input.json [--apply]');

const apply = args.includes('--apply');
const rows = parseLegacyInput(await fs.readFile(input, 'utf8'), input);
const expected = rows.map(row => mapLegacy(row));
const cutoff = new Date();
cutoff.setMonth(cutoff.getMonth() - 1);
const prisma = new PrismaClient();

const report = {
  mode: apply ? 'apply' : 'dry-run',
  sourceCount: rows.length,
  foundCount: 0,
  statusUpdates: 0,
  approvalsToCreate: 0,
  ledgerEntriesToCreate: 0,
  reviewDueCount: 0,
  missingLegacyIds: [],
};

try {
  const applications = await prisma.application.findMany({
    where: { sourceSystem: 'V1', legacyId: { in: expected.map(({ record }) => record.legacyId) } },
    include: { approvals: true, ledgerEntries: true, reviews: true },
  });
  const byLegacyId = new Map(applications.map(application => [application.legacyId, application]));
  const statusIds = [];
  const approvals = [];
  const ledgerEntries = [];
  const auditLogs = [];

  for (const { record } of expected) {
    const application = byLegacyId.get(record.legacyId);
    if (!application) {
      report.missingLegacyIds.push(record.legacyId);
      continue;
    }
    report.foundCount++;
    const approval = record.approvals.create;
    const ledgerEntry = record.ledgerEntries.create;
    const changed = application.status !== 'APPROVED' || !application.approvals.length || !application.ledgerEntries.length;
    if (application.status !== 'APPROVED') statusIds.push(application.id);
    if (!application.approvals.length) approvals.push({ applicationId: application.id, ...approval });
    if (!application.ledgerEntries.length) ledgerEntries.push({ applicationId: application.id, ...ledgerEntry });
    if (changed) auditLogs.push({
      applicationId: application.id,
      actor: 'migration',
      role: 'EVALUATOR',
      action: 'LEGACY_DEFAULT_APPROVAL',
      afterJson: JSON.stringify({ status: 'APPROVED', approvedAmount: approval.approvedAmount, approvalDate: approval.createdAt }),
      reason: 'V1历史数据默认已审核并进入投入台账',
    });
    if (approval.createdAt <= cutoff && application.reviews.length === 0) report.reviewDueCount++;
  }

  report.statusUpdates = statusIds.length;
  report.approvalsToCreate = approvals.length;
  report.ledgerEntriesToCreate = ledgerEntries.length;

  if (apply) {
    if (report.missingLegacyIds.length) throw new Error('存在未导入的 V1 记录，已阻止回填');
    const operations = [];
    if (statusIds.length) operations.push(prisma.application.updateMany({ where: { id: { in: statusIds } }, data: { status: 'APPROVED', revision: { increment: 1 } } }));
    if (approvals.length) operations.push(prisma.approval.createMany({ data: approvals }));
    if (ledgerEntries.length) operations.push(prisma.ledgerEntry.createMany({ data: ledgerEntries }));
    if (auditLogs.length) operations.push(prisma.auditLog.createMany({ data: auditLogs }));
    if (operations.length) await prisma.$transaction(operations);
  }

  console.log(JSON.stringify(report));
} finally {
  await prisma.$disconnect();
}
