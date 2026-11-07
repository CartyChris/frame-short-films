import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('exports an animated shot and safely returns it to the model library',async({page})=>{
 await page.goto('/');await dismissWelcome(page);await page.getByRole('button',{name:'3D studio'}).click();await page.getByRole('button',{name:'Explore the animated example'}).click();
 await page.getByText('Cascadeur animation exchange',{exact:true}).click();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export shot for Cascadeur'}).click();const file=await download;
 expect(file.suggestedFilename()).toMatch(/\.glb$/);
 await page.getByLabel('Import Cascadeur file').setInputFiles((await file.path())!);
 await expect(page.getByText(/Returned model added to your library/)).toBeVisible();
 await page.getByRole('button',{name:'Export film',exact:true}).click();const backup=page.waitForEvent('download');await page.getByRole('button',{name:/Complete project/}).click();
 const saved=JSON.parse(await (await backup).createReadStream().then(async stream=>{const chunks:Buffer[]=[];for await(const chunk of stream)chunks.push(Buffer.from(chunk));return Buffer.concat(chunks).toString()}));
 expect(saved.project.models.some((model:any)=>model.sourceFormat==='glb'&&model.data?.startsWith('data:'))).toBe(true);
});
