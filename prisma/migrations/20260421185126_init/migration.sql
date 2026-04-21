-- CreateEnum
CREATE TYPE "Geo" AS ENUM ('US', 'India', 'Colombia');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('employee', 'contractor');

-- CreateEnum
CREATE TYPE "RecognitionPreference" AS ENUM ('public', 'team_only', 'private');

-- CreateEnum
CREATE TYPE "BudgetPeriodStatus" AS ENUM ('draft', 'approved', 'active', 'closed');

-- CreateEnum
CREATE TYPE "PoolType" AS ENUM ('manager_tier1', 'peer_tier1', 'department_tier2', 'committee_tier3', 'reserve');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('submitted', 'under_review', 'approved', 'denied', 'fulfilled', 'cancelled');

-- CreateEnum
CREATE TYPE "ApprovalActionType" AS ENUM ('approve', 'deny', 'propose_upgrade', 'escalate', 'request_info', 'recuse', 'group_into_team_award', 'undo');

-- CreateEnum
CREATE TYPE "DenialReason" AS ENUM ('failed_loophole', 'value_mismatch', 'already_recognized', 'insufficient_detail', 'other');

-- CreateEnum
CREATE TYPE "RewardType" AS ENUM ('cash', 'gift_card', 'experience', 'l_and_d', 'custom');

-- CreateEnum
CREATE TYPE "RewardStatus" AS ENUM ('selected', 'selected_pending_confirm', 'issued', 'delivered', 'failed', 'unclaimed');

-- CreateEnum
CREATE TYPE "DeliveryMechanism" AS ENUM ('tremendous', 'justworks_csv', 'zoho_payroll', 'manual');

-- CreateEnum
CREATE TYPE "CommitteeDecisionType" AS ENUM ('approve', 'deny', 'defer');

-- CreateEnum
CREATE TYPE "DigestStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "ReflectionType" AS ENUM ('FIRST_RECOGNITION', 'SPECIFIC_MOMENT', 'BROADER_PATTERN', 'OTHER');

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "geo" "Geo" NOT NULL,
    "manager_id" TEXT,
    "role_title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employment_type" "EmploymentType" NOT NULL DEFAULT 'employee',
    "recognition_preference" "RecognitionPreference" NOT NULL DEFAULT 'public',
    "department" TEXT,
    "is_department_head" BOOLEAN NOT NULL DEFAULT false,
    "is_people_team_rep" BOOLEAN NOT NULL DEFAULT false,
    "is_committee_member" BOOLEAN NOT NULL DEFAULT false,
    "tier2_assignments_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Value" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPeriod" (
    "id" TEXT NOT NULL,
    "period_label" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "total_allocation_usd" DECIMAL(10,2) NOT NULL,
    "status" "BudgetPeriodStatus" NOT NULL DEFAULT 'draft',
    "approved_by" TEXT[],
    "approved_at" TIMESTAMP(3),
    "allocation_config" JSONB,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "BudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetPool" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "pool_type" "PoolType" NOT NULL,
    "geo" "Geo",
    "owner_id" TEXT,
    "department" TEXT,
    "allocated_amount_usd" DECIMAL(10,2) NOT NULL,
    "spent_amount_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "reserved_amount_usd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "remaining_amount_usd" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "BudgetPool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Nomination" (
    "id" TEXT NOT NULL,
    "nominator_id" TEXT NOT NULL,
    "nominee_id" TEXT NOT NULL,
    "value_id" TEXT NOT NULL,
    "behavior_text" TEXT NOT NULL,
    "outcome_text" TEXT NOT NULL,
    "evidence_links" TEXT[],
    "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_tier" INTEGER NOT NULL DEFAULT 1,
    "status" "NominationStatus" NOT NULL DEFAULT 'submitted',
    "current_approver_id" TEXT,
    "team_award_group_id" TEXT,
    "duplicate_of_id" TEXT,
    "tier2_dept_head_id" TEXT,
    "tier2_people_team_rep_id" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "last_nudge_at" TIMESTAMP(3),
    "last_escalation_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "denied_at" TIMESTAMP(3),
    "acknowledged_at" TIMESTAMP(3),
    "post_fired_at" TIMESTAMP(3),
    "post_message_ts" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApprovalAction" (
    "id" TEXT NOT NULL,
    "nomination_id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" "ApprovalActionType" NOT NULL,
    "from_tier" INTEGER,
    "to_tier" INTEGER,
    "reason_structured" "DenialReason",
    "reason_text" TEXT,
    "reflection_type" "ReflectionType",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScopeNoteTemplate" (
    "id" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "template_text" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ScopeNoteTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "geo" "Geo" NOT NULL,
    "reward_type" "RewardType" NOT NULL,
    "vendor" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reward" (
    "id" TEXT NOT NULL,
    "nomination_id" TEXT NOT NULL,
    "reward_type" "RewardType" NOT NULL,
    "vendor" TEXT,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "amount_local" DECIMAL(10,2),
    "currency_local" TEXT,
    "status" "RewardStatus" NOT NULL DEFAULT 'selected',
    "delivery_mechanism" "DeliveryMechanism" NOT NULL,
    "scope_note_template_id" TEXT,
    "scope_note_text" TEXT,
    "issued_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "recipient_dm_scheduled_at" TIMESTAMP(3),
    "recipient_dm_sent_at" TIMESTAMP(3),

    CONSTRAINT "Reward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamAwardGroup" (
    "id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "TeamAwardGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommitteeDecision" (
    "id" TEXT NOT NULL,
    "nomination_id" TEXT,
    "team_award_group_id" TEXT,
    "committee_members" TEXT[],
    "decision" "CommitteeDecisionType" NOT NULL,
    "approved_amount_usd" DECIMAL(10,2),
    "reward_form" TEXT,
    "delivery_plan" TEXT,
    "decision_log_text" TEXT,
    "conflicted_members" TEXT[],
    "substitute_member_id" TEXT,
    "delivered_by_id" TEXT,
    "delivered_at" TIMESTAMP(3),
    "decided_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommitteeDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL,
    "nomination_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reaction_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "nomination_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Digest" (
    "id" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "status" "DigestStatus" NOT NULL DEFAULT 'draft',
    "content" TEXT NOT NULL,
    "featured_nomination_ids" TEXT[],
    "published_at" TIMESTAMP(3),
    "published_by_id" TEXT,

    CONSTRAINT "Digest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetException" (
    "id" TEXT NOT NULL,
    "nomination_id" TEXT NOT NULL,
    "pool_id" TEXT NOT NULL,
    "amount_usd" DECIMAL(10,2) NOT NULL,
    "approver_id" TEXT NOT NULL,
    "reason_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BudgetException_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Employee_email_key" ON "Employee"("email");

-- CreateIndex
CREATE INDEX "Employee_is_people_team_rep_tier2_assignments_count_idx" ON "Employee"("is_people_team_rep", "tier2_assignments_count");

-- CreateIndex
CREATE INDEX "Employee_is_department_head_department_geo_idx" ON "Employee"("is_department_head", "department", "geo");

-- CreateIndex
CREATE UNIQUE INDEX "Value_name_key" ON "Value"("name");

-- CreateIndex
CREATE INDEX "BudgetPeriod_status_start_date_idx" ON "BudgetPeriod"("status", "start_date");

-- CreateIndex
CREATE INDEX "BudgetPool_period_id_pool_type_geo_idx" ON "BudgetPool"("period_id", "pool_type", "geo");

-- CreateIndex
CREATE INDEX "BudgetPool_period_id_pool_type_department_geo_idx" ON "BudgetPool"("period_id", "pool_type", "department", "geo");

-- CreateIndex
CREATE INDEX "BudgetPool_owner_id_idx" ON "BudgetPool"("owner_id");

-- CreateIndex
CREATE INDEX "Nomination_nominator_id_nominee_id_submitted_at_idx" ON "Nomination"("nominator_id", "nominee_id", "submitted_at");

-- CreateIndex
CREATE INDEX "Nomination_current_approver_id_status_idx" ON "Nomination"("current_approver_id", "status");

-- CreateIndex
CREATE INDEX "Nomination_tier2_dept_head_id_status_current_tier_idx" ON "Nomination"("tier2_dept_head_id", "status", "current_tier");

-- CreateIndex
CREATE INDEX "Nomination_tier2_people_team_rep_id_status_current_tier_idx" ON "Nomination"("tier2_people_team_rep_id", "status", "current_tier");

-- CreateIndex
CREATE INDEX "Nomination_current_tier_status_submitted_at_idx" ON "Nomination"("current_tier", "status", "submitted_at");

-- CreateIndex
CREATE INDEX "ApprovalAction_nomination_id_created_at_idx" ON "ApprovalAction"("nomination_id", "created_at");

-- CreateIndex
CREATE INDEX "ApprovalAction_actor_id_action_idx" ON "ApprovalAction"("actor_id", "action");

-- CreateIndex
CREATE INDEX "ScopeNoteTemplate_tier_active_idx" ON "ScopeNoteTemplate"("tier", "active");

-- CreateIndex
CREATE INDEX "CatalogItem_geo_active_idx" ON "CatalogItem"("geo", "active");

-- CreateIndex
CREATE INDEX "CatalogItem_geo_reward_type_active_idx" ON "CatalogItem"("geo", "reward_type", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Reward_nomination_id_key" ON "Reward"("nomination_id");

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_nomination_id_user_id_reaction_type_key" ON "Reaction"("nomination_id", "user_id", "reaction_type");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPool" ADD CONSTRAINT "BudgetPool_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "BudgetPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetPool" ADD CONSTRAINT "BudgetPool_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_nominator_id_fkey" FOREIGN KEY ("nominator_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_nominee_id_fkey" FOREIGN KEY ("nominee_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_value_id_fkey" FOREIGN KEY ("value_id") REFERENCES "Value"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_current_approver_id_fkey" FOREIGN KEY ("current_approver_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_team_award_group_id_fkey" FOREIGN KEY ("team_award_group_id") REFERENCES "TeamAwardGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Nomination" ADD CONSTRAINT "Nomination_duplicate_of_id_fkey" FOREIGN KEY ("duplicate_of_id") REFERENCES "Nomination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "Nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApprovalAction" ADD CONSTRAINT "ApprovalAction_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "Nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reward" ADD CONSTRAINT "Reward_scope_note_template_id_fkey" FOREIGN KEY ("scope_note_template_id") REFERENCES "ScopeNoteTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamAwardGroup" ADD CONSTRAINT "TeamAwardGroup_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "Nomination"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_team_award_group_id_fkey" FOREIGN KEY ("team_award_group_id") REFERENCES "TeamAwardGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommitteeDecision" ADD CONSTRAINT "CommitteeDecision_delivered_by_id_fkey" FOREIGN KEY ("delivered_by_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "Nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "Nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Digest" ADD CONSTRAINT "Digest_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetException" ADD CONSTRAINT "BudgetException_nomination_id_fkey" FOREIGN KEY ("nomination_id") REFERENCES "Nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetException" ADD CONSTRAINT "BudgetException_pool_id_fkey" FOREIGN KEY ("pool_id") REFERENCES "BudgetPool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetException" ADD CONSTRAINT "BudgetException_approver_id_fkey" FOREIGN KEY ("approver_id") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
