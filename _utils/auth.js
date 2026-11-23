const enc = new TextEncoder();
export const json = (data, status=200, headers={}) => new Response(JSON.stringify(data), {status, headers:{'content-type':'application/json; charset=utf-8', ...headers}});
export async function hash(value) { const digest = await crypto.subtle.digest('SHA-256', enc.encode(value)); return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', salt:enc.encode(salt), iterations:210000, hash:'SHA-256'}, key, 256);
  return [...new Uint8Array(bits)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export function cookie(request, name) { const raw=request.headers.get('Cookie')||''; const part=raw.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'=')); return part ? decodeURIComponent(part.slice(name.length+1)) : null; }
export async function currentUser(request, env) {
  if (!env.DB) throw new Error('D1 binding DB is missing');
  const token=cookie(request,'lp_session'); if(!token) return null;
  const tokenHash=await hash(token);
  return await env.DB.prepare(`SELECT u.id,u.username,u.xp,u.level FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at > datetime('now')`).bind(tokenHash).first();
}
export function sessionCookie(token, maxAge=604800) { return `lp_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`; }
export function randomToken() { const b=new Uint8Array(32); crypto.getRandomValues(b); return [...b].map(x=>x.toString(16).padStart(2,'0')).join(''); }
