-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "v2_application_status" AS ENUM ('DRAFT', 'EXTRACTED', 'REVIEWING', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "v2_user_role" AS ENUM ('APPLICANT', 'EVALUATOR', 'APPROVER');

-- CreateTable
CREATE TABLE "v2_user_access" (
    "userId" UUID NOT NULL,
    "role" "v2_user_role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "v2_user_access_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "v2_applications" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "applicationNo" TEXT NOT NULL,
    "ownerId" UUID,
    "status" "v2_application_status" NOT NULL DEFAULT 'DRAFT',
    "region" TEXT,
    "district" TEXT,
    "applicant" TEXT,
    "hospital" TEXT,
    "kol" TEXT,
    "projectName" TEXT,
    "meetingDate" TIMESTAMP(3),
    "requestedAmount" DECIMAL(16,4),
    "sourceSystem" TEXT NOT NULL DEFAULT 'V2',
    "legacyId" TEXT,
    "legacyStatus" TEXT,
    "migrationBatch" TEXT,
    "originalSnapshot" JSONB,
    "narrativeOverride" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "v2_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_attachments" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "ocrText" TEXT,
    "extractionStatus" TEXT NOT NULL DEFAULT 'UPLOADED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_extracted_fields" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sourceValue" TEXT,
    "confirmedValue" TEXT,
    "sourceText" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "needsConfirmation" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "v2_extracted_fields_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_score_breakdowns" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "option" TEXT,
    "score" INTEGER,
    "maxScore" INTEGER,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "evidence" TEXT,
    "ruleVersion" TEXT NOT NULL DEFAULT '2026.1',

    CONSTRAINT "v2_score_breakdowns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_evaluations" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "rawScore" INTEGER,
    "percentile" DOUBLE PRECISION,
    "grade" TEXT,
    "recommendedRange" TEXT,
    "defaultAmount" DECIMAL(16,4),
    "completeness" DOUBLE PRECISION,
    "minPossible" INTEGER,
    "maxPossible" INTEGER,
    "confidence" DOUBLE PRECISION,
    "missingKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "risks" TEXT,
    "narrative" TEXT,
    "ruleVersion" TEXT NOT NULL DEFAULT '2026.1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_approvals" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "approvedAmount" DECIMAL(16,4),
    "reason" TEXT,
    "approver" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_ledger_entries" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "region" TEXT,
    "hospital" TEXT,
    "kol" TEXT,
    "product" TEXT,
    "requestedAmount" DECIMAL(16,4),
    "recommendedAmount" DECIMAL(16,4),
    "approvedAmount" DECIMAL(16,4),
    "actualAmount" DECIMAL(16,4),
    "note" TEXT,
    "year" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_post_event_reviews" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "targetSales" DECIMAL(16,4),
    "actualSales" DECIMAL(16,4),
    "incrementalSales" DECIMAL(16,4),
    "coveredDepartments" TEXT,
    "actualSpend" DECIMAL(16,4),
    "roi" DOUBLE PRECISION,
    "conclusion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_post_event_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_audit_logs" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT,
    "actor" TEXT NOT NULL,
    "role" "v2_user_role" NOT NULL,
    "action" TEXT NOT NULL,
    "beforeJson" TEXT,
    "afterJson" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "v2_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_rule_options" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "ruleVersion" TEXT NOT NULL DEFAULT '2026.1',

    CONSTRAINT "v2_rule_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_amount_bands" (
    "id" TEXT NOT NULL,
    "minScore" INTEGER NOT NULL,
    "maxScore" INTEGER,
    "grade" TEXT NOT NULL,
    "rangeLabel" TEXT NOT NULL,
    "defaultAmount" DECIMAL(16,4) NOT NULL,

    CONSTRAINT "v2_amount_bands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "v2_ocr_runs" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sourceFile" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "ocrProvider" TEXT NOT NULL DEFAULT 'PaddleOCR',
    "llmProvider" TEXT NOT NULL DEFAULT 'DeepSeek',
    "errorMessage" TEXT,
    "ocrText" TEXT,
    "resultJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "v2_ocr_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "v2_applications_projectId_key" ON "v2_applications"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "v2_applications_applicationNo_key" ON "v2_applications"("applicationNo");

-- CreateIndex
CREATE INDEX "v2_applications_ownerId_idx" ON "v2_applications"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "v2_applications_sourceSystem_legacyId_key" ON "v2_applications"("sourceSystem", "legacyId");

-- CreateIndex
CREATE UNIQUE INDEX "v2_extracted_fields_applicationId_key_key" ON "v2_extracted_fields"("applicationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "v2_score_breakdowns_applicationId_key_key" ON "v2_score_breakdowns"("applicationId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "v2_ledger_entries_applicationId_key" ON "v2_ledger_entries"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "v2_rule_options_key_label_key" ON "v2_rule_options"("key", "label");

-- CreateIndex
CREATE UNIQUE INDEX "v2_amount_bands_minScore_key" ON "v2_amount_bands"("minScore");

-- AddForeignKey
ALTER TABLE "v2_attachments" ADD CONSTRAINT "v2_attachments_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_extracted_fields" ADD CONSTRAINT "v2_extracted_fields_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_score_breakdowns" ADD CONSTRAINT "v2_score_breakdowns_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_evaluations" ADD CONSTRAINT "v2_evaluations_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_approvals" ADD CONSTRAINT "v2_approvals_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_ledger_entries" ADD CONSTRAINT "v2_ledger_entries_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_post_event_reviews" ADD CONSTRAINT "v2_post_event_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_audit_logs" ADD CONSTRAINT "v2_audit_logs_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "v2_ocr_runs" ADD CONSTRAINT "v2_ocr_runs_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "v2_applications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- No browser access to V2 tables. Node is the authorization boundary.
ALTER TABLE "v2_applications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_user_access" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_extracted_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_score_breakdowns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_post_event_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_rule_options" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_amount_bands" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "v2_ocr_runs" ENABLE ROW LEVEL SECURITY;
-- Audit records are append-only, including for backend credentials.
CREATE FUNCTION v2_prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'v2 audit records are append-only';
END;
$$;
CREATE TRIGGER v2_audit_immutable BEFORE UPDATE OR DELETE ON v2_audit_logs
FOR EACH ROW EXECUTE FUNCTION v2_prevent_audit_mutation();
