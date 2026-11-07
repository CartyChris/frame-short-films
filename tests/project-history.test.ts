import {describe,it,expect} from 'vitest';
import {preserveOperationHistory} from '../src/lib/project-history';
import {emptyProductionTools} from '../src/lib/production-tools';
import type {Project} from '../src/lib/types';

describe('project undo history',()=>{
 it('restores creative content without rewinding external job and tool journals',()=>{
  const old={name:'Earlier',productionTools:{...emptyProductionTools(),captionImports:[{id:'caption'}]}} as unknown as Project;
  const current={name:'Newer',productionTools:{...emptyProductionTools(),higgsfieldJobs:[{operationId:'paid',requestId:'provider',status:'queued'}],comfyCloudJobs:[{id:'cloud',status:'submitting'}],freefieldJobs:[{job:{requestId:'local'}}],comfyJobs:[{id:'workflow'}]},mcpHistory:[{id:'tool-call'}],integrationJobs:[{id:'integration'}]} as unknown as Project;
  const result=preserveOperationHistory(old,current);
  expect(result.name).toBe('Earlier');expect(result.productionTools?.captionImports).toEqual(old.productionTools?.captionImports);
  expect(result.productionTools?.higgsfieldJobs).toEqual(current.productionTools?.higgsfieldJobs);expect(result.productionTools?.comfyCloudJobs).toEqual(current.productionTools?.comfyCloudJobs);expect(result.productionTools?.freefieldJobs).toEqual(current.productionTools?.freefieldJobs);expect(result.productionTools?.comfyJobs).toEqual(current.productionTools?.comfyJobs);expect(result.mcpHistory).toEqual(current.mcpHistory);expect(result.integrationJobs).toEqual(current.integrationJobs);
 });
});
