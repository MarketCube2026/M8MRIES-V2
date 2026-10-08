import type { Prisma } from '@prisma/client';

// Historical snapshots, OCR evidence and full histories belong to the detail endpoint.
export const applicationListSelect = {
  id: true, projectId: true, applicationNo: true, status: true,
  region: true, district: true, applicant: true, hospital: true, kol: true,
  projectName: true, meetingDate: true, requestedAmount: true, sourceSystem: true,
  createdAt: true, updatedAt: true,
  fields: { select: { key: true, sourceValue: true, confirmedValue: true } },
  approvals: { orderBy: { createdAt: 'desc' }, take: 1,
    select: { createdAt: true, approvedAmount: true, decision: true } },
  reviews: { select: { id: true } },
} satisfies Prisma.ApplicationSelect;
