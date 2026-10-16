export type Entry = { name:string; path:string; kind:'file'|'directory'; size?:number };
export type ToolEvent = { id:string; tool:string; status:'running'|'success'|'error'|'approval'; input?:unknown; output?:unknown; error?:string; at:number; durationMs?:number };
export type ChatMessage = { id:string; role:'user'|'assistant'|'system'; content:string; at:number; events?:ToolEvent[] };
export type WorkspaceState = { root:string|null; name:string|null };
export type TaskState = { id:string; goal:string; status:'running'|'paused'|'completed'|'blocked'|'failed'; stage:string; checklist:{text:string;done:boolean;evidence?:string}[]; updatedAt:number };
export type Settings = { provider:'huggingface'|'openai-compatible'|'bedrock'; model:string; endpoint:string; awsRegion:string; hfToken:string; e2bKey:string; hfTokenConfigured?:boolean; e2bKeyConfigured?:boolean; useE2B:boolean; maxCycles:number };
export type AvailableModel = { id:string; owned_by?:string };
export type Api = {
  chooseWorkspace:()=>Promise<WorkspaceState>; createWorkspace:()=>Promise<WorkspaceState>; getWorkspace:()=>Promise<WorkspaceState>;
  listFiles:(path?:string)=>Promise<Entry[]>; readFile:(path:string)=>Promise<string>; writeFile:(path:string,content:string)=>Promise<{ok:boolean;path:string}>; searchFiles:(query:string)=>Promise<{path:string;line:number;text:string}[]>;
  runCommand:(command:string)=>Promise<{code:number|null;stdout:string;stderr:string;approved:boolean}>; startPreview:()=>Promise<{url:string;pid:number}>; stopPreview:()=>Promise<boolean>; checkPreview:()=>Promise<{ok:boolean;url?:string;error?:string}>;
  getSettings:()=>Promise<Settings>; saveSettings:(s:Settings)=>Promise<boolean>; testProvider:(s:Settings)=>Promise<{ok:boolean;message:string}>; discoverModels:(s:Settings)=>Promise<AvailableModel[]>; e2bRun:(code:string)=>Promise<{ok:boolean;output:string;error?:string}>;
  conversations:()=>Promise<{id:string;title:string;updatedAt:number}[]>; messages:(id:string)=>Promise<ChatMessage[]>; newConversation:()=>Promise<string>; sendMessage:(id:string,text:string)=>Promise<void>; continueTask:()=>Promise<void>; cancelTask:()=>Promise<void>; onEvent:(cb:(e:any)=>void)=>()=>void;
  getTask:()=>Promise<TaskState|null>; checkpoint:()=>Promise<{id:string;createdAt:number;files:number}>; listCheckpoints:()=>Promise<{id:string;createdAt:number;files:number}[]>; restoreCheckpoint:(id:string)=>Promise<{ok:boolean;message:string}>;
  feedback:(text:string)=>Promise<boolean>; feedbackQueue:()=>Promise<{id:string;text:string;status:string;createdAt:number}[]>; openExternal:(url:string)=>Promise<void>;
};
declare global { interface Window { agentix: Api } }
