import {json, passwordHash, randomToken, hash, sessionCookie} from '../../_utils/auth.js';
export async function onRequestPost({request, env}) {
  try {
    if(!env.DB) return json({error:'D1 binding DB не подключён (ожидается DB).'},500);
    const body=await request.json(); const username=String(body.username||'').trim(); const password=String(body.password||'');
    if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(username)) return json({error:'Имя: 3–24 символа, буквы, цифры, _ или -.'},400);
    if(password.length<10 || password.length>128) return json({error:'Пароль должен содержать от 10 до 128 символов.'},400);
    const salt=randomToken(); const pass=await passwordHash(password,salt);
    let result;
    try { result=await env.DB.prepare('INSERT INTO users(username,password_hash,password_salt,xp,level) VALUES(?,?,?,0,1)').bind(username,pass,salt).run(); }
    catch(e){ return json({error:'Это имя пользователя уже занято.'},409); }
    const userId=result.meta.last_row_id; const token=randomToken(); const tokenHash=await hash(token);
    await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,datetime('now','+7 days'))").bind(tokenHash,userId).run();
    return json({ok:true,user:{id:userId,username,xp:0,level:1}},200,{'set-cookie':sessionCookie(token)});
  } catch(e){ return json({error:'Ошибка регистрации: '+e.message},500); }
}
