export type ToolAction=Record<string,unknown>&{tool:string};
export type ToolPlan={message?:string;actions:ToolAction[]};

function extractJsonObject(text:string){
  const start=text.indexOf('{');
  if(start<0)throw new Error('Model returned plain text instead of the required JSON object. It may not follow structured tool instructions.');
  let depth=0;
  let inString=false;
  let escaped=false;
  for(let i=start;i<text.length;i++){
    const char=text[i];
    if(inString){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char==='"')inString=false;
      continue;
    }
    if(char==='"'){inString=true;continue;}
    if(char==='{')depth++;
    else if(char==='}'&&--depth===0)return text.slice(start,i+1);
  }
  throw new Error('Response contained an incomplete JSON object.');
}

export function parseToolPlan(response:string):ToolPlan{
  const parsed=JSON.parse(extractJsonObject(response)) as Record<string,unknown>;
  if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Plan must be a JSON object.');
  if(!Array.isArray(parsed.actions))throw new Error('Plan must include an actions array.');
  const actions=parsed.actions.map(raw=>{
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return raw;
    const action=raw as Record<string,unknown>;
    return typeof action.tool==='string'?action:typeof action.action==='string'?{...action,tool:action.action}:action;
  });
  if(actions.length>4)throw new Error('Plan may contain at most four actions.');
  for(const [index,raw] of actions.entries()){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`Action ${index+1} must be an object.`);
    const action=raw as Record<string,unknown>;
    const tool=action.tool;
    if(typeof tool!=='string'||!tool.trim())throw new Error(`Action ${index+1} is missing its tool name.`);
    if(/^(inspect_project|verify_completion)$/.test(tool))continue;
    if(tool==='list_files')continue;
    if(tool==='read_file'&&typeof action.path==='string'&&action.path.trim())continue;
    if(tool==='search_files'&&typeof action.query==='string'&&action.query.trim())continue;
    if(tool==='write_file'&&typeof action.path==='string'&&action.path.trim()&&typeof action.content==='string')continue;
    if(tool==='run_command'&&typeof action.command==='string'&&action.command.trim())continue;
    if(tool==='generate_image'&&typeof action.prompt==='string'&&action.prompt.trim())continue;
    if(['list_files','read_file','search_files','write_file','run_command','generate_image'].includes(tool))throw new Error(`Action ${index+1} (${tool}) is missing a required field. ${tool==='write_file'?'Provide both "path" and "content".':''}`);
    throw new Error(`Action ${index+1} uses unsupported tool "${tool}".`);
  }
  const serialized=JSON.stringify(parsed);
  if(serialized.includes('brief progress summary')||serialized.includes('relative/path')||serialized.includes('visual description'))throw new Error('Plan contains example placeholders rather than concrete actions.');
  return {message:typeof parsed.message==='string'?parsed.message:undefined,actions:actions as ToolAction[]};
}
