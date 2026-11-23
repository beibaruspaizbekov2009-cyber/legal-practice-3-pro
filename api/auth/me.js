import {json,currentUser} from '../../_utils/auth.js';
export async function onRequestGet({request,env}) { try { const user=await currentUser(request,env); return json({ok:true,user}); } catch(e){return json({error:e.message},500);} }
