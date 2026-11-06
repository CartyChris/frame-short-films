import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from '../server/handlers.js';
export const maxDuration=300;
export default function handler(req:IncomingMessage,res:ServerResponse){return handleApi(req,res);}
