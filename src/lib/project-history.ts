import type {Project} from './types';
import {emptyProductionTools} from './production-tools';

/** Creative edits can be undone without rewinding records of external operations. */
export function preserveOperationHistory(snapshot:Project,current:Project):Project {
 const saved=current.productionTools;
 const tools=snapshot.productionTools||emptyProductionTools();
 return {...snapshot,
  integrationJobs:current.integrationJobs,
  mcpHistory:current.mcpHistory,
  productionTools:{...tools,comfyJobs:saved?.comfyJobs||[],freefieldJobs:saved?.freefieldJobs,comfyCloudJobs:saved?.comfyCloudJobs,higgsfieldJobs:saved?.higgsfieldJobs},
 };
}
