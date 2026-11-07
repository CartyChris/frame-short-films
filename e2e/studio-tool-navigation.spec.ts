import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/');
 await page.getByRole('dialog',{name:'See the studio in action?'}).getByRole('button',{name:'Start fresh'}).click();
});

test('studio tools remain accessible beside the work area',async({page})=>{
 const workspaces=page.getByRole('navigation',{name:'Workspaces'});
 await workspaces.getByRole('button',{name:'Produce',exact:true}).click();
 const tools=page.getByRole('navigation',{name:'Production tools'});
 await tools.getByRole('button',{name:'Agent team'}).click();
 await expect(page.locator('.production-team')).toHaveJSProperty('open',true);
 const rail=await tools.boundingBox(),area=await page.locator('.production-layout').boundingBox();
 expect(rail&&area&&rail.x+rail.width<=area.x+1).toBeTruthy();
 await workspaces.getByRole('button',{name:'Sound & music'}).click();
 const sound=page.getByRole('navigation',{name:'Sound tools'});
 await sound.getByRole('button',{name:'Effects'}).click();
 await expect(sound.getByRole('button',{name:'Effects'})).toHaveClass(/active/);
 const soundRail=await sound.boundingBox(),soundBody=await page.locator('.sound-scroll').boundingBox();
 expect(soundRail&&soundBody&&soundRail.x+soundRail.width<=soundBody.x+1).toBeTruthy();
 await workspaces.getByRole('button',{name:'Story & cast'}).click();
 const story=page.getByRole('navigation',{name:'Story studio sections'});
 await story.getByRole('button',{name:'Places'}).click();
 await expect(story.getByRole('button',{name:'Places'})).toHaveClass(/active/);
 const storyRail=await story.boundingBox(),storyBody=await page.locator('.story-body').boundingBox();
 expect(storyRail&&storyBody&&storyRail.x+storyRail.width<=storyBody.x+1).toBeTruthy();
});

test.describe('compact screens',()=>{
 test.use({viewport:{width:390,height:844}});
 test('studio tools remain usable',async({page})=>{
  const workspaces=page.getByRole('navigation',{name:'Workspaces'});
  await workspaces.getByRole('button',{name:'Produce',exact:true}).click();
  await page.getByRole('navigation',{name:'Production tools'}).getByRole('button',{name:'Settings'}).click();
  await expect(page.locator('.production-settings')).toHaveJSProperty('open',true);
  await workspaces.getByRole('button',{name:'Sound & music'}).click();
  const sound=page.getByRole('navigation',{name:'Sound tools'});
  await sound.getByRole('button',{name:'Voice'}).click();
  await expect(sound.getByRole('button',{name:'Voice'})).toHaveClass(/active/);
  await workspaces.getByRole('button',{name:'Story & cast'}).click();
  const story=page.getByRole('navigation',{name:'Story studio sections'});
  await story.getByRole('button',{name:'Cast',exact:true}).click();
  await expect(story.getByRole('button',{name:'Cast',exact:true})).toHaveClass(/active/);
 });
});
