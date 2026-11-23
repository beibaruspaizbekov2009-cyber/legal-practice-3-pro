import {json,cookie,hash,sessionCookie} from '../../_utils/auth.js';
export async function onRequestPost({request,env}) { try { const token=cookie(request,'lp_session'); if(token && env.DB) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hash(token)).run(); return json({ok:true},200,{'set-cookie':sessionCookie('',0)}); } catch(e){return json({error:e.message},500);} }
