import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('drop files and mention a saved file from the composer',async({page})=>{
 await page.goto('/');await dismissWelcome(page);await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();
 const transfer=await page.evaluateHandle(()=>{const data=new DataTransfer();data.items.add(new File(['A small paper moon'],'notes.txt',{type:'text/plain'}));return data});
 await page.locator('.director-chat').dispatchEvent('drop',{dataTransfer:transfer});
 await expect(page.locator('.director-pending-files').getByText('notes.txt')).toBeVisible();
 await page.getByRole('button',{name:'Remove notes.txt from next message'}).click();
 const composer=page.getByLabel('Message your director');await composer.fill('Please use @note');
 await expect(page.getByRole('listbox',{name:'Saved file suggestions'}).getByRole('option',{name:/notes.txt/})).toBeVisible();
 await composer.press('Enter');await expect(page.locator('.director-pending-files').getByText('notes.txt')).toBeVisible();
 await expect(composer).toHaveValue('Please use ');await page.getByRole('button',{name:'Send director message'}).click();
 await expect(page.locator('.director-message.user').getByText('notes.txt')).toBeVisible();
});

test('reviewed shots can be edited, added, reordered and removed without losing the outline',async({page})=>{
 await page.goto('/');await dismissWelcome(page);await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();
 await page.getByLabel('Message your director').fill('Plan a short paper film');await page.getByRole('button',{name:'Send director message'}).click();
 await page.getByLabel('What happens in your film? A sentence is enough.').fill('A fox finds a lantern.');await page.getByRole('button',{name:'30 seconds',exact:true}).click();await page.getByRole('button',{name:'Paper cut-out'}).click();await page.getByRole('button',{name:'Continue with these answers'}).click();
 await page.getByText('Edit shot outline',{exact:false}).click();await page.getByLabel('Shot 1 title').fill('A lantern appears');await page.getByRole('button',{name:'Add shot'}).click();await page.getByLabel('Shot 2 title').fill('The fox follows');await page.getByRole('button',{name:'Move shot 2 up'}).click();await expect(page.getByLabel('Shot 1 title')).toHaveValue('The fox follows');
 await page.getByRole('button',{name:'Add shot'}).click();await page.getByRole('button',{name:'Remove shot 3'}).click();await expect(page.getByLabel('Shot 3 title')).toHaveCount(0);
 await page.reload();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();await page.getByText('Edit shot outline',{exact:false}).click();
 await expect(page.getByLabel('Shot 1 title')).toHaveValue('The fox follows');await expect(page.getByLabel('Shot 2 title')).toHaveValue('A lantern appears');
 await page.getByRole('button',{name:'Save this proposal'}).click();await expect(page.getByText('Saved to your film')).toBeVisible();
});
