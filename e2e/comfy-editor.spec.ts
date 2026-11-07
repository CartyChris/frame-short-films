import {test,expect} from '@playwright/test';
import {dismissWelcome} from './welcome-helper';

test('opens the connected ComfyUI editor only when requested',async({page})=>{
 let requests=0;
 await page.route('http://127.0.0.1:8188/**',async route=>{requests++;await route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture ComfyUI</title><h1>ComfyUI fixture</h1>'})});
 await page.goto('/');await dismissWelcome(page);
 await page.getByRole('navigation',{name:'Workspaces'}).getByRole('button',{name:'Studios',exact:true}).click();
 await page.getByRole('navigation',{name:'Production tool categories'}).getByRole('button',{name:'ComfyUI',exact:true}).click();
 expect(requests).toBe(0);
 await page.getByRole('button',{name:'Open ComfyUI editor here'}).click();
 await expect(page.frameLocator('iframe[title="Your ComfyUI editor"]').getByRole('heading',{name:'ComfyUI fixture'})).toBeVisible();
 await expect(page.getByRole('link',{name:/Open in a new tab/})).toHaveAttribute('href','http://127.0.0.1:8188/');
 await page.getByRole('button',{name:'Close editor'}).click();await expect(page.locator('iframe[title="Your ComfyUI editor"]')).toHaveCount(0);
 await page.getByLabel('ComfyUI address').fill('https://example.com/');await page.getByRole('button',{name:'Open ComfyUI editor here'}).click();
 await expect(page.getByRole('alert')).toContainText('loopback');
});
