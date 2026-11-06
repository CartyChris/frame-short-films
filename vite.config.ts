import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {handleApi} from './server/handlers';
export default defineConfig({resolve:{alias:{phonemizer:fileURLToPath(new URL('./src/lib/local-phonemizer.ts',import.meta.url))}},plugins:[react(),{name:'frame-local-api',configureServer(server){server.middlewares.use((req,res,next)=>{if(req.url?.startsWith('/api/')){handleApi(req,res).catch(error=>{if(!res.headersSent)res.statusCode=500;if(!res.writableEnded)res.end(JSON.stringify({error:error.message}))})}else next()})}}],optimizeDeps:{entries:['index.html']},server:{port:5173,strictPort:true},build:{target:'es2022',chunkSizeWarningLimit:900,rollupOptions:{output:{manualChunks:{three:['three'],editor:['@codemirror/state','@codemirror/view','@codemirror/lang-html']}}}}});
