import {build} from 'esbuild';
import {mkdir,readFile,copyFile} from 'node:fs/promises';
async function notices(names){const texts=await Promise.all(names.map(async ([name,file])=>name+'\n'+await readFile(new URL('../node_modules/'+name+'/'+file,import.meta.url),'utf8')));return '/*!\n'+texts.join('\n\n').replace(/\*\//g,'* /')+'\n*/';}
await mkdir(new URL('../public/runtime/',import.meta.url),{recursive:true});
await build({entryPoints:[new URL('../src/lib/three/engine.ts',import.meta.url).pathname],outfile:new URL('../public/runtime/frame-three.js',import.meta.url).pathname,bundle:true,format:'iife',globalName:'FrameThree',banner:{js:await notices([['three','LICENSE'],['postprocessing','LICENSE.md'],['three-gpu-pathtracer','LICENSE'],['three-mesh-bvh','LICENSE'],['xatlas-web','LICENSE'],['three.quarks','LICENSE'],['quarks.core','LICENSE']])},platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
// Keep the legacy URL for already-open v5 clients; new shells use an immutable versioned URL.
await copyFile(new URL('../public/runtime/frame-three.js',import.meta.url),new URL('../public/runtime/frame-three-v6.js',import.meta.url));
console.log('Built the shared offline Three.js film runtime.');

await build({entryPoints:[new URL('../src/lib/motion/runtime.ts',import.meta.url).pathname],outfile:new URL('../public/runtime/frame-motion.js',import.meta.url).pathname,bundle:true,format:'iife',globalName:'FrameMotion',banner:{js:await notices([['animejs','LICENSE.md'],['lottie-web','LICENSE.md']])},platform:'browser',target:'es2022',minify:true,legalComments:'eof'});
console.log('Built the shared offline Anime.js / Lottie motion runtime.');
