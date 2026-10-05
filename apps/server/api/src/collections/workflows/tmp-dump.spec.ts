import { writeFileSync } from 'node:fs';
import { SystemWorkflowDefinitionRegistrarService } from '@api/collections/workflows/services/system-workflow-definition-registrar.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { collectServiceRegisteredDefinitions, collectSystemWorkflowDefinitions } from '@api/shared/testing/system-workflow-definition-discovery';
import { it } from 'vitest';
it('dump', async () => {
  const d = await collectSystemWorkflowDefinitions();
  const s = await collectServiceRegisteredDefinitions(SystemWorkflowRunnerService);
  const reg: string[] = [];
  new SystemWorkflowDefinitionRegistrarService({ registerWorkflow: (x: { canonicalId: string }) => reg.push(x.canonicalId) } as never).onModuleInit();
  const root = process.cwd();
  writeFileSync('/tmp/dump5912.json', JSON.stringify({ disc: d.map(x=>x.canonicalId), reg, svc: s.definitions.map(x=>x.canonicalId), registering: s.registeringFiles.map(f=>f.replace(root,'')), contributing: s.contributingFiles.map(f=>f.replace(root,'')) }, null, 1));
}, 120000);
