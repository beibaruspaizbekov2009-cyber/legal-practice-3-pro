import {json} from '../../_utils/auth.js';
export async function onRequestGet({env}) { try { if(!env.DB) return json({error:'D1 binding DB не подключён.'},500); const {results=[]}=await env.DB.prepare('SELECT id,username,xp,level FROM users ORDER BY xp DESC, username ASC LIMIT 100').all(); return json({ok:true,users:results}); } catch(e){return json({error:e.message},500);} }
