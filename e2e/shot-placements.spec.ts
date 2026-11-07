import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('edit, reorder, save and reload a shot with an explicitly selected attachment',async({page})=>{
 await page.goto('/');await dismissWelcome(page);await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();
 await page.getByLabel('Choose files for Chat').setInputFiles({name:'voice.wav',mimeType:'audio/wav',buffer:Buffer.from('audio fixture')});
 await expect(page.locator('.director-pending-files').getByText('voice.wav')).toBeVisible();
 await page.getByLabel('Message your director').fill('Use this sound in a paper film.');await page.getByRole('button',{name:'Send director message'}).click();
 await page.getByLabel('What happens in your film? A sentence is enough.').fill('A fox finds a lantern.');await page.getByRole('button',{name:'30 seconds',exact:true}).click();await page.getByRole('button',{name:'Paper cut-out'}).click();await page.getByRole('button',{name:'Continue with these answers'}).click();
 await page.getByText('Edit shot outline',{exact:false}).click();await page.getByLabel('Add media to shot 1').selectOption({label:'voice.wav'});
 await page.getByLabel('Shot 1 media 1 duration').fill('7');await page.getByLabel('Shot 1 media 1 start').fill('2');await page.getByLabel('Shot 1 media 1 trim').fill('1');
 await page.getByRole('button',{name:'Add shot'}).click();await page.getByRole('button',{name:'Move shot 1 down'}).click();
 await expect(page.getByLabel('Shot 2 media 1 start')).toHaveValue('2');await expect(page.getByLabel('Shot 2 media 1 duration')).toHaveValue('7');
 await page.reload();await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Chat',exact:true}).click();await page.getByText('Edit shot outline',{exact:false}).click();
 await expect(page.getByLabel('Shot 2 media 1 trim')).toHaveValue('1');await page.getByRole('button',{name:'Save this proposal'}).click();await expect(page.getByText('Saved to your film')).toBeVisible();
});
