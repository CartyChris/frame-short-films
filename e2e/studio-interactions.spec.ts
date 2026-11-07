import {test,expect} from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/');
 const welcome=page.getByRole('dialog',{name:'See the studio in action?'});
 await expect(welcome).toBeVisible();
 await welcome.getByRole('button',{name:'Start fresh'}).click();
 await expect(welcome).toHaveCount(0);
 await page.getByLabel('Film name').waitFor();
});

test('hover help and scene context actions work without intercepting native text editing',async({page})=>{
 const undo=page.getByRole('button',{name:'Undo edit'}),clip=page.locator('.scene-clip').first();
 await page.getByLabel('Film name').fill('Context test');await undo.hover();
 const tip=page.getByRole('tooltip');await expect(tip).toContainText('Undo edit');await expect(undo).toHaveAttribute('aria-describedby',/frame-button-help/);
 await clip.click({button:'right'});const menu=page.getByRole('menu',{name:/Scene:.*quick actions/});await expect(menu).toBeVisible();await menu.getByRole('menuitem',{name:'Duplicate scene'}).click();await expect(page.locator('.scene-clip')).toHaveCount(2);
 await page.locator('.scene-clip').last().click({button:'right'});await page.getByRole('menuitem',{name:'Remove scene'}).click();await expect(page.locator('.scene-clip')).toHaveCount(1);await undo.click();await expect(page.locator('.scene-clip')).toHaveCount(2);
 await page.locator('.scene-clip').first().focus();await page.keyboard.press('Shift+F10');await expect(page.getByRole('menu',{name:/Scene:.*quick actions/})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('menu')).toHaveCount(0);
 await page.getByLabel('Film name').click({button:'right'});await expect(page.getByRole('menu')).toHaveCount(0);
});

test('media and workspace menus expose actions for the clicked area',async({page})=>{
 await page.locator('.app > input[type=file][multiple]').setInputFiles({name:'menu.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><circle cx="10" cy="10" r="8"/></svg>')});
 await page.locator('.asset-card').filter({hasText:'menu.svg'}).click({button:'right'});const menu=page.getByRole('menu',{name:/Media:.*quick actions/});await expect(menu.getByRole('menuitem',{name:'Add to timeline'})).toBeVisible();await menu.getByRole('menuitem',{name:'Move to Recovery'}).click();await expect(page.locator('.asset-card').filter({hasText:'menu.svg'})).toHaveCount(0);
 await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();await page.locator('.director-header').click({button:'right'});await expect(page.getByRole('menu',{name:'Chat quick actions'}).getByRole('menuitem',{name:'Open Film'})).toBeVisible();await page.getByRole('menuitem',{name:'Open Film'}).click();await expect(page.locator('.timeline')).toBeVisible();
});

test('scene quick actions also open the inspector on a narrow screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.locator('.scene-clip').first().click({button:'right'});
 await page.getByRole('menuitem',{name:'Duplicate scene'}).click();
 await expect(page.locator('.scene-clip')).toHaveCount(2);
 await page.locator('.scene-clip').last().click({button:'right'});
 await page.getByRole('menuitem',{name:'Remove scene'}).click();
 await expect(page.locator('.scene-clip')).toHaveCount(1);
});
