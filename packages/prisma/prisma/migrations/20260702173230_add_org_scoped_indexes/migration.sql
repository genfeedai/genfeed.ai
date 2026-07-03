
-- CreateIndex
CREATE INDEX "org_integrations_organizationId_isDeleted_idx" ON "org_integrations"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "bookmarks_organizationId_isDeleted_createdAt_idx" ON "bookmarks"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "tracked_links_organizationId_isDeleted_createdAt_idx" ON "tracked_links"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "schedules_organizationId_isDeleted_createdAt_idx" ON "schedules"("organizationId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "distributions_organizationId_isDeleted_createdAt_idx" ON "distributions"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "customers_organizationId_isDeleted_idx" ON "customers"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "subscriptions_organizationId_isDeleted_idx" ON "subscriptions"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "subscription_attributions_organizationId_idx" ON "subscription_attributions"("organizationId");

-- CreateIndex
CREATE INDEX "customer_instances_organizationId_isDeleted_idx" ON "customer_instances"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "articles_organizationId_isDeleted_createdAt_idx" ON "articles"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "newsletters_organizationId_isDeleted_createdAt_idx" ON "newsletters"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "transcripts_organizationId_isDeleted_createdAt_idx" ON "transcripts"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_threads_organizationId_isDeleted_updatedAt_idx" ON "agent_threads"("organizationId", "isDeleted", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "agent_strategies_organizationId_isDeleted_createdAt_idx" ON "agent_strategies"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_strategy_opportunities_organizationId_isDeleted_creat_idx" ON "agent_strategy_opportunities"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_strategy_reports_organizationId_isDeleted_createdAt_idx" ON "agent_strategy_reports"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_campaigns_organizationId_isDeleted_createdAt_idx" ON "agent_campaigns"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_goals_organizationId_isDeleted_createdAt_idx" ON "agent_goals"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_memories_organizationId_createdAt_idx" ON "agent_memories"("organizationId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "agent_workflows_organizationId_isDeleted_idx" ON "agent_workflows"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "workflow_executions_organizationId_isDeleted_createdAt_idx" ON "workflow_executions"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "cron_jobs_organizationId_isDeleted_createdAt_idx" ON "cron_jobs"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "cron_runs_organizationId_isDeleted_createdAt_idx" ON "cron_runs"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "task_comments_organizationId_taskId_createdAt_idx" ON "task_comments"("organizationId", "taskId", "createdAt");

-- CreateIndex
CREATE INDEX "bots_organizationId_isDeleted_createdAt_idx" ON "bots"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "bot_activities_organizationId_isDeleted_createdAt_idx" ON "bot_activities"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "reply_bot_configs_organizationId_isDeleted_createdAt_idx" ON "reply_bot_configs"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "monitored_accounts_organizationId_isDeleted_createdAt_idx" ON "monitored_accounts"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "content_patterns_organizationId_isDeleted_createdAt_idx" ON "content_patterns"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "creator_analyses_organizationId_isDeleted_createdAt_idx" ON "creator_analyses"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "pattern_playbooks_organizationId_isDeleted_createdAt_idx" ON "pattern_playbooks"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "creative_patterns_organizationId_isDeleted_idx" ON "creative_patterns"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "content_plans_organizationId_isDeleted_createdAt_idx" ON "content_plans"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "content_plan_items_organizationId_isDeleted_createdAt_idx" ON "content_plan_items"("organizationId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "optimizations_organizationId_isDeleted_createdAt_idx" ON "optimizations"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "evaluations_organizationId_isDeleted_updatedAt_idx" ON "evaluations"("organizationId", "isDeleted", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "insights_organizationId_isDeleted_createdAt_idx" ON "insights"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "forecasts_organizationId_isDeleted_idx" ON "forecasts"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "ad_bulk_upload_jobs_organizationId_isDeleted_createdAt_idx" ON "ad_bulk_upload_jobs"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ad_creative_mappings_organizationId_isDeleted_idx" ON "ad_creative_mappings"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "ad_optimization_audit_logs_organizationId_isDeleted_created_idx" ON "ad_optimization_audit_logs"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ad_optimization_recommendations_organizationId_isDeleted_cr_idx" ON "ad_optimization_recommendations"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ad_performance_organizationId_isDeleted_idx" ON "ad_performance"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "trends_organizationId_isDeleted_createdAt_idx" ON "trends"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "trend_preferences_organizationId_brandId_idx" ON "trend_preferences"("organizationId", "brandId");

-- CreateIndex
CREATE INDEX "outreach_campaigns_organizationId_isDeleted_idx" ON "outreach_campaigns"("organizationId", "isDeleted");

-- CreateIndex
CREATE INDEX "campaign_targets_campaignId_createdAt_idx" ON "campaign_targets"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "elements_camera_movements_organizationId_isDeleted_createdA_idx" ON "elements_camera_movements"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_lenses_organizationId_isDeleted_createdAt_idx" ON "elements_lenses"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_lightings_organizationId_isDeleted_createdAt_idx" ON "elements_lightings"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_moods_organizationId_isDeleted_createdAt_idx" ON "elements_moods"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_scenes_organizationId_isDeleted_createdAt_idx" ON "elements_scenes"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_sounds_organizationId_isDeleted_createdAt_idx" ON "elements_sounds"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "elements_styles_organizationId_isDeleted_createdAt_idx" ON "elements_styles"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "font_families_organizationId_isDeleted_createdAt_idx" ON "font_families"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "presets_organizationId_isDeleted_createdAt_idx" ON "presets"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "captions_organizationId_isDeleted_createdAt_idx" ON "captions"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "editor_projects_organizationId_isDeleted_createdAt_idx" ON "editor_projects"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "context_bases_organizationId_isDeleted_createdAt_idx" ON "context_bases"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "skills_organizationId_isDeleted_createdAt_idx" ON "skills"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "templates_organizationId_isDeleted_createdAt_idx" ON "templates"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "template_usages_organizationId_idx" ON "template_usages"("organizationId");

-- CreateIndex
CREATE INDEX "watchlists_brandId_isDeleted_createdAt_idx" ON "watchlists"("brandId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "goals_organizationId_isDeleted_createdAt_idx" ON "goals"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "streaks_organizationId_userId_idx" ON "streaks"("organizationId", "userId");

-- CreateIndex
CREATE INDEX "profiles_organizationId_isDeleted_createdAt_idx" ON "profiles"("organizationId", "isDeleted", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "runs_organizationId_isDeleted_createdAt_idx" ON "runs"("organizationId", "isDeleted", "createdAt" DESC);

