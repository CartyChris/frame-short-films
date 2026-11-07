import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('a reviewed local server is discoverable and can be granted to production',async({page})=>{
 const fingerprint='a'.repeat(64),profiles:any[]=[],requests:any[]=[];
 await page.route('http://127.0.0.1:4319/integrations/**',async route=>{
  const cors={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'authorization,content-type'};
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return}
  const url=new URL(route.request().url());let result:any={};
  if(url.pathname.endsWith('/profiles')){
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();requests.push(body);const profile={...body.profile,revision:'fixture-revision'};profiles.push(profile);result={profile}}else result={profiles};
  }else if(url.pathname.endsWith('/connect')){requests.push(route.request().postDataJSON());result={connectionId:'session',status:'connected',serverFingerprint:fingerprint,serverInfo:{name:'Cascadeur test',version:'1'},tools:[{name:'cascadeur_set_pose',inputSchema:{type:'object'}}]}}
  await route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto('/');await dismissWelcome(page);await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();await page.getByRole('button',{name:/Local tools/}).click();
 await page.getByLabel('Pairing token').fill('test-token');await page.getByLabel('Connection type').selectOption('custom-stdio');await page.getByText('Add or update a local server').click();
 await page.getByLabel('Profile ID').fill('cascadeur');await page.getByLabel('Absolute executable path').fill('/usr/bin/python3');await page.getByLabel('Fixed arguments (JSON array)').fill('["/home/user/cascadeur-mcp/server.py"]');
 await expect(page.getByRole('button',{name:'Save reviewed server'})).toBeDisabled();await page.getByLabel('I trust this executable and reviewed its arguments').check();await page.getByRole('button',{name:'Save reviewed server'}).click();
 await expect(page.getByRole('button',{name:'Connect & discover tools'})).toBeEnabled();await page.getByRole('button',{name:'Connect & discover tools'}).click();await expect(page.getByText('Cascadeur test · 1 tools',{exact:true})).toBeVisible();
 expect(requests[0]).toMatchObject({reviewed:true,profile:{id:'cascadeur',executable:'/usr/bin/python3',args:['/home/user/cascadeur-mcp/server.py']}});expect(requests[1]).toEqual({transport:'custom-stdio',profileId:'cascadeur'});
 await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Produce',exact:true}).click();await page.getByText('Connected studio tools',{exact:false}).click();await page.getByLabel('Allow this production to use selected tools').check();await expect(page.getByText('cascadeur_set_pose')).toBeVisible();
});
