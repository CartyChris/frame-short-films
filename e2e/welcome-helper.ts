import type {Page} from '@playwright/test';

/** Existing editor journeys start with an empty film; onboarding has dedicated coverage. */
export async function dismissWelcome(page:Page){
 await page.getByLabel('Film name').waitFor();
 const welcome=page.getByRole('dialog',{name:'See the studio in action?'});
 if(await welcome.isVisible())await welcome.getByRole('button',{name:'Start fresh'}).click();
}
