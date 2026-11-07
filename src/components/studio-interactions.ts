/** Context menus invoke the editor's existing controls, so normal validation and undo apply. */
export interface QuickAction { label:string; description?:string; disabled?:boolean; run:()=>void }
export interface QuickMenu { title:string; actions:QuickAction[] }
const text=(el:Element)=>((el.getAttribute('aria-label')||el.getAttribute('title')||el.textContent||'').replace(/\s+/g,' ').trim());
const clickable=(el:Element|null):el is HTMLButtonElement=>el instanceof HTMLButtonElement&&!el.disabled&&el.getClientRects().length>0;
const matchButton=(root:ParentNode, label:string)=>[...root.querySelectorAll('button')].find(b=>clickable(b)&&text(b)===label) as HTMLButtonElement|undefined;
const buttonAction=(label:string,button:HTMLButtonElement|null|undefined,description?:string):QuickAction|undefined=>clickable(button||null)?{label,description,run:()=>{if(button!.isConnected&&!button!.disabled)button!.click()}}:undefined;
const compact=(actions:(QuickAction|undefined)[])=>actions.filter((x):x is QuickAction=>!!x);
function afterSelected(target:HTMLElement,selectedClass:string,resolve:()=>HTMLButtonElement|undefined){
 target.click();requestAnimationFrame(()=>{if(!target.isConnected||!target.classList.contains(selectedClass))return;const button=resolve();if(clickable(button||null))button!.click()});
}
function workspace(root:ParentNode,name:string){const nav=root.querySelector('nav[aria-label="Workspaces"]')||root;return [...nav.querySelectorAll('button')].find(b=>clickable(b)&&text(b).replace(/\s*NEW$/i,'')===name) as HTMLButtonElement|undefined}
function navigate(root:ParentNode,names:string[]){return names.map(name=>buttonAction(`Open ${name}`,workspace(root,name)))}
export function resolveQuickMenu(root:HTMLElement,target:Element):QuickMenu|undefined {
 // Native editing menus retain copy, paste, spelling, and accessibility commands.
 if(target.closest('input,textarea,select,[contenteditable="true"],.cm-editor,[role="dialog"],.frame-quick-menu'))return;
 const scene=target.closest<HTMLButtonElement>('.scene-clip');
 if(scene&&root.contains(scene)){
  const duplicate=root.querySelector<HTMLButtonElement>('button[aria-label="Duplicate selected scene"]');
  const removeAvailable=root.querySelectorAll('.scene-track .scene-clip').length>1;
  return {title:`Scene: ${text(scene)}`,actions:compact([
   buttonAction('Select scene',scene,'Show this scene on the timeline.'),
   clickable(duplicate)?{label:'Duplicate scene',run:()=>afterSelected(scene,'selected',()=>root.querySelector<HTMLButtonElement>('button[aria-label="Duplicate selected scene"]')||undefined)}:undefined,
   {label:'Edit scene settings',run:()=>afterSelected(scene,'selected',()=>matchButton(root.querySelector('.inspector-tabs')||root,'Scene'))},
   removeAvailable?{label:'Remove scene',description:'The change can be undone.',run:()=>afterSelected(scene,'selected',()=>{matchButton(root.querySelector('.inspector-tabs')||root,'Scene')?.click();requestAnimationFrame(()=>{if(scene.isConnected&&scene.classList.contains('selected'))matchButton(root.querySelector('.inspector-scroll')||root,'Remove scene')?.click()});return undefined})}:undefined,
  ])};
 }
 const asset=target.closest<HTMLElement>('.asset-card');
 if(asset&&root.contains(asset))return {title:`Media: ${text(asset.querySelector('strong')||asset)}`,actions:compact([
  buttonAction('Add to timeline',asset.querySelector<HTMLButtonElement>('button[aria-label^="Add "]')),
  buttonAction('Move to Recovery',asset.querySelector<HTMLButtonElement>('button[aria-label^="Move "]'),'Existing films keep their media.'),
 ])};
 const project=target.closest<HTMLButtonElement>('.project-card');
 if(project&&root.contains(project)){const row=project.parentElement!;return {title:`Film: ${text(project.querySelector('strong')||project)}`,actions:compact([
  buttonAction('Open film',project),buttonAction('Move to Recovery',matchButton(row,`Move ${text(project.querySelector('strong')||project)} to Recovery`),'The film can be restored from Recovery.'),
 ])}}
 const model=target.closest<HTMLButtonElement>('.s3-asset');
 if(model&&root.contains(model)){const row=model.parentElement!;return {title:`Model: ${text(model.querySelector('strong')||model)}`,actions:compact([
  buttonAction('Add to shot',model),buttonAction('Remove from library',row.querySelector<HTMLButtonElement>('button[aria-label^="Remove "]'),'Existing shots keep their model.'),
 ])}}
 const object=target.closest<HTMLButtonElement>('.s3-outliner button');
 if(object&&root.contains(object)){const action=(label:string)=>({label:`${label} object`,run:()=>afterSelected(object,'active',()=>matchButton(root.querySelector('.s3-action-row')||root,label))});return {title:`3D object: ${text(object)}`,actions:[buttonAction('Select object',object)!,action('Duplicate'),action('Remove')]}}
 const audio=target.closest<HTMLButtonElement>('.audio-clip');
 if(audio&&root.contains(audio))return {title:`Audio: ${text(audio)}`,actions:compact([buttonAction('Edit audio track',audio),{label:'Remove audio track',description:'The change can be undone.',run:()=>afterSelected(audio,'selected',()=>matchButton(root.querySelector('.inspector-scroll')||root,'Remove track'))}])};
 const tab=target.closest<HTMLButtonElement>('nav[aria-label="Workspaces"] button');
 if(tab&&root.contains(tab)&&!tab.disabled)return {title:`Workspace: ${text(tab)}`,actions:compact([buttonAction(`Open ${text(tab).replace(/\s*NEW$/i,'')}`,tab),...navigate(root,['Chat','Film','3D studio'])])};
 if(target.closest('.timeline'))return {title:'Timeline',actions:compact([
  buttonAction('Play / pause',root.querySelector<HTMLButtonElement>('button[aria-label="Play film"],button[aria-label="Pause film"]')),
  buttonAction('Undo',root.querySelector<HTMLButtonElement>('button[aria-label="Undo edit"]')),
  buttonAction('Redo',root.querySelector<HTMLButtonElement>('button[aria-label="Redo edit"]')),
  buttonAction('Add scene',root.querySelector<HTMLButtonElement>('button.add-scene')),
 ])};
 if(target.closest('.s3-viewport,.s3-stage'))return {title:'3D studio',actions:compact([
  buttonAction('Explore view',matchButton(root.querySelector('.s3-toolbar')||root,'Explore')),
  buttonAction('Film camera',matchButton(root.querySelector('.s3-toolbar')||root,'Film camera')),
  buttonAction('New 3D shot',matchButton(root.querySelector('.s3-library footer')||root,'New 3D shot')),
  ...navigate(root,['Film']),
 ])};
 const areas:[string,string,string[]][]=[['.director-chat','Chat',['Produce','Film']],['.production-studio','Production',['Chat','Film','3D studio']],['.casting-studio','Casting',['Chat','3D studio','Film']],['.sound-studio','Sound & music',['Film','Chat']],['.motion-studio','Motion',['Film','3D studio']],['.story-studio','Story & cast',['Chat','Film']],['.integrations-studio','Studios',['Produce','Film']]];
 for(const [selector,title,names] of areas)if(target.closest(selector))return {title,actions:compact(navigate(root,names))};
 if(target.closest('.preview-canvas'))return {title:'Film preview',actions:compact([buttonAction('Play / pause',root.querySelector<HTMLButtonElement>('button[aria-label="Play film"],button[aria-label="Pause film"]')),buttonAction('Export film',matchButton(root,'Export film'))])};
 if(target.closest('.library-panel'))return {title:'Library',actions:compact([buttonAction('Import files',root.querySelector<HTMLButtonElement>('button[aria-label="Import files"]')),buttonAction('Open Recovery',root.querySelector<HTMLButtonElement>('button[aria-label="Recovery"]'))])};
 const control=target.closest<HTMLButtonElement>('button');if(control&&root.contains(control)&&clickable(control)){const label=buttonHelp(control).label;return {title:label,actions:[{label,run:()=>{if(control.isConnected&&!control.disabled)control.click()}}]}}
 return;
}
const descriptions:Record<string,string>={
 'Undo edit':'Restore the previous project edit.', 'Redo edit':'Reapply the edit you just undid.',
 'Play film':'Play the film from the current position.', 'Pause film':'Pause playback at the current position.',
 'Export film':'Export a film, a project backup, or a recording.', 'Connect a model':'Choose a model provider and connection.',
 'Duplicate selected scene':'Make an editable copy of the selected scene.', 'Split scene at playhead':'Split the selected clip at the current playhead.',
 'Save a portable backup':'Export the film, its media, and saved drafts.',
 'Remove scene':'Remove this scene from the timeline. You can undo the edit.', 'New 3D shot':'Add an editable 3D shot.',
 'Produce this film':'Start the reviewed plan with the selected connected model.',
};
export function buttonHelp(button:HTMLElement):{label:string;description?:string}{
 let label=text(button);if(!label){const icon=button.querySelector('svg')?.getAttribute('class')||'';const map:Record<string,string>={'lucide-plus':'Add','lucide-trash-2':'Remove','lucide-x':'Close','lucide-search':'Search','lucide-settings-2':'Settings','lucide-play':'Play','lucide-pause':'Pause','lucide-download':'Download','lucide-upload':'Upload','lucide-copy':'Duplicate'};label=Object.entries(map).find(([name])=>icon.split(/\s+/).includes(name))?.[1]||'Action'}
 label=label.slice(0,100);return {label,description:button.getAttribute('data-help')||descriptions[label]||undefined};
}
