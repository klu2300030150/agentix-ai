import { contextBridge, ipcRenderer } from 'electron';
const invoke=(channel:string,...args:any[])=>ipcRenderer.invoke(channel,...args);
contextBridge.exposeInMainWorld('agentix',{
 chooseWorkspace:()=>invoke('workspace:choose'),createWorkspace:()=>invoke('workspace:create'),getWorkspace:()=>invoke('workspace:get'),
 listFiles:(p?:string)=>invoke('files:list',p),readFile:(p:string)=>invoke('files:read',p),writeFile:(p:string,c:string)=>invoke('files:write',p,c),searchFiles:(q:string)=>invoke('files:search',q),runCommand:(c:string)=>invoke('terminal:run',c),
 startPreview:()=>invoke('preview:start'),stopPreview:()=>invoke('preview:stop'),checkPreview:()=>invoke('preview:check'),getSettings:()=>invoke('settings:get'),saveSettings:(s:any)=>invoke('settings:save',s),testProvider:(s:any)=>invoke('settings:test',s),discoverModels:(s:any)=>invoke('settings:discover-models',s),e2bRun:(code:string)=>invoke('e2b:run',code),
 conversations:()=>invoke('chat:list'),messages:(id:string)=>invoke('chat:messages',id),newConversation:()=>invoke('chat:new'),sendMessage:(id:string,text:string)=>invoke('chat:send',id,text),continueTask:()=>invoke('chat:continue'),cancelTask:()=>invoke('chat:cancel'),
 getTask:()=>invoke('task:get'),checkpoint:()=>invoke('checkpoint:create'),listCheckpoints:()=>invoke('checkpoint:list'),restoreCheckpoint:(id:string)=>invoke('checkpoint:restore',id),feedback:(text:string)=>invoke('feedback:add',text),feedbackQueue:()=>invoke('feedback:list'),openExternal:(url:string)=>invoke('external:open',url),
 onEvent:(cb:(e:any)=>void)=>{const listener=(_event:unknown,payload:any)=>cb(payload);ipcRenderer.on('agentix:event',listener);return ()=>ipcRenderer.removeListener('agentix:event',listener);}
});
