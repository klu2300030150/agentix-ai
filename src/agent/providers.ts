import { HfInference } from '@huggingface/inference';
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import type { Settings } from '../shared/types';

export type ChatTurn={role:'user'|'assistant'|'system';content:string};
export type AvailableModel={id:string;owned_by?:string};

export function validateModelSettings(settings:Settings){
  if(!settings.model?.trim())throw new Error('Model ID is required.');
  if(settings.provider==='huggingface'){
    if(!settings.hfToken.trim())throw new Error('Hugging Face access token is missing. Open Settings → Models and add your token.');
    return;
  }
  if(settings.provider==='bedrock'){
    if(!settings.awsRegion?.trim())throw new Error('AWS region is required for Amazon Bedrock.');
    return;
  }
  const endpoint=getCompatibleEndpoint(settings);
  if(new URL(endpoint).hostname.endsWith('.openai.azure.com')&&!settings.hfToken.trim()){
    throw new Error('Azure OpenAI API key is missing. Add the key shown in the Azure deployment code sample.');
  }
}

function getCompatibleEndpoint(settings:Settings){
  if(!settings.endpoint?.trim())throw new Error('An API endpoint is required for the OpenAI-compatible provider.');
  let endpoint:URL;
  try{endpoint=new URL(settings.endpoint);}catch{throw new Error('The API endpoint must be a valid HTTP or HTTPS URL.');}
  if(endpoint.protocol!=='http:'&&endpoint.protocol!=='https:')throw new Error('The API endpoint must use HTTP or HTTPS.');
  return settings.endpoint.replace(/\/$/,'');
}

function appendEndpointPath(endpoint:string,path:string){
  const url=new URL(endpoint);
  const basePath=url.pathname.replace(/\/+$/,'');
  const suffix=path.replace(/^\/+/,'');
  url.pathname=`${basePath}/${suffix}`.replace(/\/+/g,'/');
  return url;
}

function isAzureOpenAIEndpoint(endpoint:URL){
  return endpoint.hostname.endsWith('.openai.azure.com');
}

function azureResponsesUrls(endpoint:string){
  const base=new URL(endpoint);
  const configuredPath=base.pathname.replace(/\/+$/,'');
  if(/\/openai\/v1$/i.test(configuredPath)){
    const v1=appendEndpointPath(endpoint,'responses');
    const legacy=new URL(endpoint);
    legacy.pathname=`${configuredPath.replace(/\/openai\/v1$/i,'')}/openai/responses`;
    legacy.search='?api-version=2025-04-01-preview';
    return {primary:v1,legacy};
  }
  if(/\/openai\/responses$/i.test(configuredPath)){
    if(!base.searchParams.has('api-version'))base.searchParams.set('api-version','2025-04-01-preview');
    return {primary:base,legacy:null};
  }
  const legacy=appendEndpointPath(endpoint,'openai/responses');
  legacy.search='?api-version=2025-04-01-preview';
  return {primary:legacy,legacy:null};
}

function sanitizedBody(body:string,apiKey:string){
  return apiKey?body.split(apiKey).join('[REDACTED]'):body;
}

async function azureResponsesRequest(
  settings:Settings,
  input:string|{role:string;content:string}[],
  maxOutputTokens?:number,
  signal?:AbortSignal,
  structuredOutput=false
){
  const endpoint=getCompatibleEndpoint(settings);
  const base=new URL(endpoint);
  if(!isAzureOpenAIEndpoint(base))throw new Error('Azure Responses API requires an Azure OpenAI resource endpoint.');
  const apiKey=settings.hfToken.trim();
  if(!apiKey)throw new Error('Azure OpenAI API key is missing. Add the key in Settings.');
  const urls=azureResponsesUrls(endpoint);
  const timeoutMs=180000;
  const request=async(url:URL)=>{
    const body:Record<string,unknown>={model:settings.model,input};
    if(maxOutputTokens!==undefined)body.max_output_tokens=maxOutputTokens;
    if(structuredOutput)body.text={format:{type:'json_object'}};
    let response:Response;
    const timeoutSignal=AbortSignal.timeout(timeoutMs);
    try{
      response=await fetch(url.toString(),{
        method:'POST',
        headers:{'Content-Type':'application/json','api-key':apiKey},
        body:JSON.stringify(body),
        signal:signal?AbortSignal.any([signal,timeoutSignal]):timeoutSignal
      });
    }catch(error){
      if(signal?.aborted)throw new Error('Model request was cancelled.');
      const detail=error instanceof Error?error.message:String(error);
      if(timeoutSignal.aborted||/timed?\s*out|timeout/i.test(detail))throw new Error(`Azure inference request to ${url.pathname}${url.search} timed out after ${timeoutMs/1000} seconds. This is not an HTTP 404 or authentication response; verify the deployment Target URI and Azure service availability before retrying.`);
      throw new Error(`Azure inference request to ${url.pathname}${url.search} could not reach the endpoint: ${detail}`);
    }
    const responseBody=await response.text();
    return {url,status:response.status,body:sanitizedBody(responseBody,apiKey)};
  };
  let result=await request(urls.primary);
  if(result.status===404&&urls.legacy){
    result=await request(urls.legacy);
  }
  if(result.status<200||result.status>=300){
    throw new Error(`Azure inference failed: POST ${result.url.pathname}${result.url.search} returned HTTP ${result.status}: ${result.body.slice(0,1000)}`);
  }
  let json:any;
  try{json=JSON.parse(result.body);}catch{
    throw new Error(`Azure inference returned HTTP ${result.status} from POST ${result.url.pathname}${result.url.search}, but the response was not valid JSON: ${result.body.slice(0,500)}`);
  }
  return {...result,json};
}

export async function discoverModels(settings:Settings):Promise<AvailableModel[]>{
  if(settings.provider!=='openai-compatible')throw new Error('Model discovery is available for OpenAI-compatible providers only.');
  const endpoint=getCompatibleEndpoint(settings);
  const endpointUrl=new URL(endpoint);
  const azure=isAzureOpenAIEndpoint(endpointUrl);
  const url=azure
    ? appendEndpointPath(endpoint,'models')
    : appendEndpointPath(endpoint,'models');
  let response:Response;
  try{
    response=await fetch(url.toString(),{headers:{Accept:'application/json',...(azure&&settings.hfToken.trim()?{'api-key':settings.hfToken.trim()}:{})},signal:AbortSignal.timeout(10000)});
  }catch(error){
    const detail=error instanceof Error?error.message:String(error);
    throw new Error(`Model discovery request to ${url.pathname}${url.search} could not reach ${endpointUrl.origin}. Discovery is separate from inference. ${detail}`);
  }
  if(!response.ok)throw new Error(`Model discovery failed: GET ${url.pathname}${url.search} returned HTTP ${response.status}: ${sanitizedBody(await response.text(),settings.hfToken).slice(0,500)}. This does not determine whether inference works.`);
  let json:{data?:unknown};
  try{json=await response.json() as {data?:unknown};}
  catch{throw new Error('The model endpoint responded with invalid JSON instead of an OpenAI-compatible /models response.');}
  if(!Array.isArray(json.data))throw new Error('The endpoint responded, but did not return the OpenAI-compatible /models response shape. Enter a model ID manually.');
  const isDockerModelRunner=endpointUrl.port==='12434'&&['localhost','127.0.0.1'].includes(endpointUrl.hostname);
  const models=json.data.flatMap((item):AvailableModel[]=>{
    if(!item||typeof item!=='object'||!('id' in item)||typeof item.id!=='string'||!item.id.trim())return [];
    return [{id:isDockerModelRunner?item.id.replace(/^docker\.io\//,''):item.id,owned_by:'owned_by' in item&&typeof item.owned_by==='string'?item.owned_by:undefined}];
  });
  if(models.length===0)throw new Error('The endpoint is reachable but has no available models. Load a model in Docker Model Runner or enter an ID manually.');
  return models;
}

export async function askModel(settings:Settings,messages:ChatTurn[],maxTokens=8192,signal?:AbortSignal,structuredOutput=false){
  if(settings.provider==='huggingface'){
    validateModelSettings(settings);
    const hf=new HfInference(settings.hfToken);
    const res=await hf.chatCompletion({model:settings.model,messages:messages.map(m=>({role:m.role,content:m.content})),max_tokens:maxTokens,temperature:0.2},{signal});
    const content=res.choices?.[0]?.message?.content;
    if(typeof content!=='string'||!content.trim())throw new Error('The selected Hugging Face model returned no text. Try a chat-completion model that is available to your account.');
    return content;
  }
  if(settings.provider==='bedrock'){
    validateModelSettings(settings);
    const client=new BedrockRuntimeClient({region:settings.awsRegion});
    const system=messages.filter(m=>m.role==='system').map(m=>({text:m.content}));
    const inputMessages=messages.filter(m=>m.role!=='system').map(m=>({role:m.role as 'user'|'assistant',content:[{text:m.content}]}));
    const response=await client.send(new ConverseCommand({modelId:settings.model,system,messages:inputMessages,inferenceConfig:{maxTokens,temperature:0.2}}),signal?{abortSignal:signal}:{});
    if(response.stopReason==='max_tokens')throw new Error('The model response reached its output token limit and was truncated. Continue with smaller files or actions, or select a model with a larger output limit.');
    const content=response.output?.message?.content?.map(item=>item.text||'').join('').trim();
    if(!content)throw new Error('Amazon Bedrock returned no text. Check model access and the selected model ID.');
    return content;
  }
  validateModelSettings(settings);
  const endpoint=getCompatibleEndpoint(settings);
  const endpointUrl=new URL(endpoint);
  if(isAzureOpenAIEndpoint(endpointUrl)){
    const response=await azureResponsesRequest(settings,messages.map(({role,content})=>({role,content})),maxTokens,signal,structuredOutput);
    const text=typeof response.json.output_text==='string'
      ? response.json.output_text
      : (response.json.output||[]).flatMap((item:any)=>item.content||[]).map((part:any)=>part.text||'').join('').trim();
    if(!text)throw new Error(`Azure inference returned HTTP ${response.status} from POST ${response.url.pathname}${response.url.search} but included no output text. Response: ${JSON.stringify(response.json).slice(0,500)}`);
    return text;
  }
  const isDockerModelRunner=endpointUrl.port==='12434'&&['localhost','127.0.0.1'].includes(endpointUrl.hostname);
  const model=isDockerModelRunner?settings.model.replace(/^docker\.io\//,''):settings.model;
  const timeoutMs=/qwen3-4b/i.test(settings.model)?240000:90000;
  const requestMessages=/qwen3/i.test(settings.model)
    ? messages.map(message=>message.role==='system'&&!/\/(?:no_)?think\b/.test(message.content)?{...message,content:`${message.content}\n/think`}:message)
    : messages;
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if(settings.hfToken.trim()&&!isDockerModelRunner)headers.Authorization=`Bearer ${settings.hfToken.trim()}`;
  const requestUrl=appendEndpointPath(endpoint,'chat/completions').toString();
  const requestBody={model,messages:requestMessages,max_tokens:maxTokens,temperature:0.2,...(structuredOutput?{response_format:{type:'json_object'}}:{})};
  let response:Response;
  try{
    const requestSignal=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
    response=await fetch(requestUrl,{method:'POST',headers,body:JSON.stringify(requestBody),signal:requestSignal});
  }catch(error){
    if(signal?.aborted)throw new Error('Model request was cancelled.');
    if(error instanceof Error&&error.name==='TimeoutError')throw new Error(`Model inference timed out after ${timeoutMs/1000} seconds. The model service may be responding slowly on this hardware; reduce the task size or close other applications to free memory.`);
    const detail=error instanceof Error?error.message:String(error);
    throw new Error(`Could not reach the model service at ${endpoint}. Confirm the service is running and the endpoint is correct. ${detail}`);
  }
  if(!response.ok)throw new Error(`Model API returned HTTP ${response.status}: ${(await response.text()).slice(0,500)}`);
  const json=await response.json() as any;
  const content=json.choices?.[0]?.message?.content;
  if(typeof content!=='string'||!content.trim())throw new Error(`Model response did not include message content${json.choices?.[0]?.finish_reason?` (finish reason: ${json.choices[0].finish_reason})`:''}.`);
  return content;
}

export async function testModel(settings:Settings){
  if(settings.provider!=='openai-compatible')return askModel(settings,[{role:'user',content:'Reply briefly with a short connection confirmation.'}],64);
  const endpoint=getCompatibleEndpoint(settings);
  if(isAzureOpenAIEndpoint(new URL(endpoint))){
    const response=await azureResponsesRequest(settings,'Reply with OK',64);
    const output=typeof response.json.output_text==='string'
      ? response.json.output_text
      : (response.json.output||[]).flatMap((item:any)=>item.content||[]).map((part:any)=>part.text||'').join('').trim();
    if(!output)throw new Error(`Azure inference returned HTTP ${response.status} from POST ${response.url.pathname}${response.url.search}, but no generated text was found. Response: ${JSON.stringify(response.json).slice(0,500)}`);
    return `Azure inference succeeded: POST ${response.url.pathname}${response.url.search} returned HTTP ${response.status}. Response body: ${JSON.stringify(response.json).slice(0,1000)}`;
  }
  const response=await askModel(settings,[{role:'system',content:'Return one JSON object with a string message and an actions array. /no_think'},{role:'user',content:'Reply with this valid empty tool plan: {"message":"Connection verified","actions":[]}'}],128,undefined,true);
  let plan:unknown;
  try{plan=JSON.parse(response);}catch{throw new Error(`Inference succeeded, but ${settings.model} did not return a JSON tool plan. The endpoint is reachable, but this model may not be suitable for Agentix coding tasks.`);}
  if(!plan||typeof plan!=='object'||Array.isArray(plan)||!('actions' in plan)||!Array.isArray((plan as {actions:unknown}).actions))throw new Error(`Inference succeeded, but ${settings.model} did not return a valid JSON tool plan. The endpoint is reachable, but this model may not be suitable for Agentix coding tasks.`);
  return `Connection and structured tool-plan test succeeded for ${settings.model}.`;
}

export async function generateImage(settings:Settings,prompt:string){
  if(!settings.hfToken.trim())throw new Error('Hugging Face token is missing. Configure it in Settings.');
  const hf=new HfInference(settings.hfToken);
  const blob=await hf.textToImage({model:'black-forest-labs/FLUX.1-schnell',inputs:prompt},{outputType:'blob'});
  return Buffer.from(await blob.arrayBuffer());
}
