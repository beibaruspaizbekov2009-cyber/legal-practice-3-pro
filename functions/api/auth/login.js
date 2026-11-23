import {json, passwordHash, randomToken, hash, sessionCookie} from '../../_utils/auth.js';
export async function onRequestPost({request,env}) {
  try {
    if(!env.DB) return json({error:'D1 binding DB не подключён.'},500);
    const b=await request.json(); const username=String(b.username||'').trim(); const password=String(b.password||'');
    const u=await env.DB.prepare('SELECT id,username,password_hash,password_salt,xp,level FROM users WHERE username=?').bind(username).first();
    if(!u || await passwordHash(password,u.password_salt)!==u.password_hash) return json({error:'Неверное имя пользователя или пароль.'},401);
    const token=randomToken(); await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(await hash(token),u.id).run();
    return json({ok:true,user:{id:u.id,username:u.username,xp:u.xp,level:u.level}},200,{'set-cookie':sessionCookie(token)});
  } catch(e){return json({error:'Ошибка входа: '+e.message},500);}
}
