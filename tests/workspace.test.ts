import {describe,it,expect,beforeEach,afterEach} from 'vitest';
import {Workspace} from '../src/agent/workspace';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
let dir:string;let ws:Workspace;
beforeEach(async()=>{dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentix-'));ws=new Workspace();ws.setRoot(dir);await fs.writeFile(path.join(dir,'hello.txt'),'hello Agentix\n');await fs.mkdir(path.join(dir,'src'));await fs.writeFile(path.join(dir,'src','app.ts'),'export const answer = 42;');await fs.writeFile(path.join(dir,'.env'),'SECRET=never');});
afterEach(async()=>fs.rm(dir,{recursive:true,force:true}));
describe('workspace sandbox',()=>{
it('lists files while excluding secrets',async()=>{const rows=await ws.list('.');expect(rows.map(x=>x.name)).toContain('hello.txt');expect(rows.map(x=>x.name)).not.toContain('.env');});
it('reads and writes within the selected workspace',async()=>{expect(await ws.read('hello.txt')).toContain('hello');await ws.write('new/file.txt','written');expect(await fs.readFile(path.join(dir,'new/file.txt'),'utf8')).toBe('written');});
it('blocks path traversal',async()=>{await expect(ws.read('../outside.txt')).rejects.toThrow(/escapes/);await expect(ws.write('../outside.txt','no')).rejects.toThrow(/escapes/);});
it('blocks secret file reads',async()=>{await expect(ws.read('.env')).rejects.toThrow(/Protected/);});
it('searches text with line numbers',async()=>{const hits=await ws.search('answer');expect(hits.some(x=>x.path==='src/app.ts'&&x.line===1)).toBe(true);});
});
