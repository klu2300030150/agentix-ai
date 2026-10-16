import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const EXCLUDED = new Set(['.git','node_modules','.next','dist','build','coverage','.venv','venv','__pycache__']);
const SECRET = /(^|\/)(\.env($|\.)|.*\.(pem|key|p12|pfx)$|id_rsa|credentials\.json|secrets?\.json)/i;
export class Workspace {
  root:string|null=null;
  setRoot(root:string){this.root=path.resolve(root);}
  requireRoot(){if(!this.root)throw new Error('Open a workspace folder first.');return this.root;}
  resolve(relative:string){const root=this.requireRoot();const resolved=path.resolve(root,relative||'.');if(resolved!==root&&!resolved.startsWith(root+path.sep))throw new Error('Blocked: path escapes selected workspace.');return resolved;}
  async list(relative='.') {const abs=this.resolve(relative);const entries=await fs.readdir(abs,{withFileTypes:true});const out=[] as {name:string;path:string;kind:'file'|'directory';size?:number}[];for(const e of entries){if(EXCLUDED.has(e.name)||SECRET.test(e.name))continue;const p=path.join(relative,e.name).replaceAll('\\','/');try{const st=await fs.lstat(this.resolve(p));if(st.isSymbolicLink())continue;out.push({name:e.name,path:p,kind:e.isDirectory()?'directory':'file',size:e.isFile()?st.size:undefined});}catch{}}return out.sort((a,b)=>a.kind===b.kind?a.name.localeCompare(b.name):a.kind==='directory'?-1:1);}
  async read(relative:string){if(SECRET.test(relative))throw new Error('Protected file blocked. Move secrets to environment variables; explicit secret-file access is not supported in automatic agent context.');const p=this.resolve(relative);const st=await fs.lstat(p);if(st.isSymbolicLink()||!st.isFile())throw new Error('Only regular files can be read.');if(st.size>1024*1024)throw new Error('File is larger than 1 MB; select a smaller file.');return fs.readFile(p,'utf8');}
  async write(relative:string,content:string){if(SECRET.test(relative))throw new Error('Writes to secret-like files are blocked.');const p=this.resolve(relative);await fs.mkdir(path.dirname(p),{recursive:true});const parent=await fs.realpath(path.dirname(p));if(parent!==this.requireRoot()&&!parent.startsWith(this.requireRoot()+path.sep))throw new Error('Blocked: symlink escapes workspace.');const old=await fs.lstat(p).catch(()=>null);if(old?.isSymbolicLink())throw new Error('Writes through symlinks are blocked.');await fs.writeFile(p,content,'utf8');return p;}
  async writeBinary(relative:string,data:Buffer){
    if(SECRET.test(relative))throw new Error('Writes to secret-like files are blocked.');
    if(!/\.(png|jpe?g|webp)$/i.test(relative))throw new Error('Generated image must use .png, .jpg, .jpeg, or .webp extension.');
    const p=this.resolve(relative);await fs.mkdir(path.dirname(p),{recursive:true});
    const parent=await fs.realpath(path.dirname(p));if(parent!==this.requireRoot()&&!parent.startsWith(this.requireRoot()+path.sep))throw new Error('Blocked: symlink escapes workspace.');
    const old=await fs.lstat(p).catch(()=>null);if(old?.isSymbolicLink())throw new Error('Writes through symlinks are blocked.');
    await fs.writeFile(p,data);const sig=await fs.readFile(p);
    const png=sig.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));const jpg=sig[0]===255&&sig[1]===216;const webp=sig.subarray(0,4).toString()==='RIFF'&&sig.subarray(8,12).toString()==='WEBP';
    if(!png&&!jpg&&!webp){await fs.unlink(p).catch(()=>{});throw new Error('Provider response was not a recognized PNG/JPEG/WebP image; file removed.');}return p;
  }
  async search(query:string){const results:{path:string;line:number;text:string}[]=[];let visited=0;const walk=async(rel:string):Promise<void>=>{if(results.length>=100||visited>=5000)return;let entries;try{entries=await fs.readdir(this.resolve(rel),{withFileTypes:true});}catch{return;}for(const e of entries){if(EXCLUDED.has(e.name)||SECRET.test(e.name))continue;const r=path.join(rel,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory()){await walk(r);continue;}if(!e.isFile())continue;visited++;try{const st=await fs.stat(this.resolve(r));if(st.size>250000)continue;const data=await fs.readFile(this.resolve(r),'utf8');if(data.includes('\0'))continue;data.split(/\r?\n/).forEach((line,i)=>{if(results.length<100&&line.toLowerCase().includes(query.toLowerCase()))results.push({path:r.replaceAll('\\','/'),line:i+1,text:line.slice(0,300)});});}catch{}}};await walk('.');return results;}
  async snapshot(){const files:{path:string;content:string}[]=[];const walk=async(rel:string)=>{for(const e of await this.list(rel)){const p=path.join(rel,e.name);if(e.kind==='directory')await walk(p);else {try{const st=await fs.stat(this.resolve(p));if(st.size<=300000)files.push({path:p.replaceAll('\\','/'),content:await fs.readFile(this.resolve(p),'utf8')});}catch{}}}};await walk('.');return {id:crypto.randomUUID(),createdAt:Date.now(),files};}
}
