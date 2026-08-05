ALTER TABLE "clip_projects"
VALIDATE CONSTRAINT "clip_projects_userId_fkey";

ALTER TABLE "clip_results"
VALIDATE CONSTRAINT "clip_results_userId_fkey";

ALTER TABLE "clip_results"
VALIDATE CONSTRAINT "clip_results_projectId_fkey";
