import {describe,it,expect,vi,afterEach} from 'vitest';
import {askModel,discoverModels,testModel,validateModelSettings} from '../src/agent/providers';
import type {Settings} from '../src/shared/types';

const dockerSettings:Settings={
  provider:'openai-compatible',
  model:'docker.io/ai/smollm2:360M-Q4_K_M',
  endpoint:'http://localhost:12434/engines/v1',
  awsRegion:'us-east-1',
  hfToken:'',
  e2bKey:'',
  useE2B:false,
  maxCycles:6
};

afterEach(()=>vi.restoreAllMocks());

describe('model provider configuration',()=>{
  it('accepts an unauthenticated OpenAI-compatible endpoint',()=>{
    expect(()=>validateModelSettings(dockerSettings)).not.toThrow();
  });

  it('requires a token only for Hugging Face',()=>{
    expect(()=>validateModelSettings({...dockerSettings,provider:'huggingface'})).toThrow(/Hugging Face access token/);
  });

  it('sends Docker-compatible requests without an authorization header',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'Agentix connection OK'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    await expect(askModel(dockerSettings,[{role:'user',content:'test'}])).resolves.toBe('Agentix connection OK');
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:12434/engines/v1/chat/completions',
      expect.objectContaining({headers:{'Content-Type':'application/json'}})
    );
  });

  it('tests Azure v1 inference with POST /openai/v1/responses and api-key auth',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      output_text:'OK'
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const azureSettings={
      ...dockerSettings,
      model:'gpt-6-astra',
      endpoint:'https://agentix-resource.openai.azure.com/openai/v1/',
      hfToken:'rotated-test-key'
    };

    await expect(testModel(azureSettings)).resolves.toContain(
      'POST /openai/v1/responses returned HTTP 200'
    );
    expect(fetchMock).toHaveBeenCalledWith('https://agentix-resource.openai.azure.com/openai/v1/responses',expect.objectContaining({
      method:'POST',
      headers:{'Content-Type':'application/json','api-key':'rotated-test-key'},
      body:JSON.stringify({model:'gpt-6-astra',input:'Reply with OK',max_output_tokens:64})
    }));
  });

  it('falls back from Azure v1 Responses 404 to the legacy Responses API URL',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({error:{message:'Resource not found'}}),{status:404}))
      .mockResolvedValueOnce(new Response(JSON.stringify({output_text:'OK'}),{status:200}));
    const azureSettings={
      ...dockerSettings,
      model:'gpt-6-astra',
      endpoint:'https://agentix-resource.openai.azure.com/openai/v1/',
      hfToken:'rotated-test-key'
    };

    await expect(testModel(azureSettings)).resolves.toContain(
      'POST /openai/responses?api-version=2025-04-01-preview returned HTTP 200'
    );
    expect(fetchMock.mock.calls.map(call=>call[0])).toEqual([
      'https://agentix-resource.openai.azure.com/openai/v1/responses',
      'https://agentix-resource.openai.azure.com/openai/responses?api-version=2025-04-01-preview'
    ]);
  });

  it('reports Azure inference status and sanitized error body without exposing the key',async()=>{
    const apiKey='secret-test-key';
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      error:{message:`invalid key ${apiKey}`}
    }),{status:401}));
    const azureSettings={
      ...dockerSettings,
      model:'gpt-6-astra',
      endpoint:'https://agentix-resource.openai.azure.com/openai/v1/',
      hfToken:apiKey
    };

    await expect(testModel(azureSettings)).rejects.toThrow(
      /POST \/openai\/v1\/responses returned HTTP 401.*\[REDACTED\]/
    );
    await expect(testModel({...azureSettings,hfToken:''})).rejects.toThrow(/API key is missing/);
  });

  it('reports Azure fetch timeout as timeout, not connection failure',async()=>{
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new DOMException('The operation was aborted due to timeout','AbortError'));
    const azureSettings={
      ...dockerSettings,
      model:'gpt-6-astra',
      endpoint:'https://agentix-resource.openai.azure.com/openai/v1/',
      hfToken:'rotated-test-key'
    };

    await expect(testModel(azureSettings)).rejects.toThrow(
      /Azure inference request to \/openai\/v1\/responses timed out after 180 seconds/
    );
  });

  it('keeps Azure model discovery on the configured v1 path and separates its failure from inference',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('not found',{status:404}));
    const azureSettings={
      ...dockerSettings,
      model:'gpt-6-astra',
      endpoint:'https://agentix-resource.openai.azure.com/openai/v1/',
      hfToken:'rotated-test-key'
    };

    await expect(discoverModels(azureSettings)).rejects.toThrow(
      /Model discovery failed: GET \/openai\/v1\/models returned HTTP 404.*does not determine whether inference works/
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://agentix-resource.openai.azure.com/openai/v1/models',
      expect.objectContaining({headers:{Accept:'application/json','api-key':'rotated-test-key'}})
    );
  });

  it('requests JSON-mode output for agent tool plans',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'{"message":"Inspecting","actions":[]}'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    await askModel(dockerSettings,[{role:'user',content:'inspect'}],128,undefined,true);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).response_format).toEqual({type:'json_object'});
  });

  it('uses Qwen3 thinking mode for coding and tool-plan requests',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'{"message":"Ready","actions":[]}'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const qwenSettings={...dockerSettings,model:'huggingface.co/qwen/qwen3-4b-gguf:Q4_K_M'};
    await askModel(qwenSettings,[{role:'system',content:'Return JSON.'},{role:'user',content:'Plan'}],128,undefined,true);
    const request=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.messages[0].content).toContain('/think');
    expect(request.response_format).toEqual({type:'json_object'});
  });

  it('preserves explicit Qwen3 non-thinking mode for short connection checks',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'{"message":"Ready","actions":[]}'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const qwenSettings={...dockerSettings,model:'huggingface.co/qwen/qwen3-4b-gguf:Q4_K_M'};
    await askModel(qwenSettings,[{role:'system',content:'Return JSON. /no_think'},{role:'user',content:'Check'}],128,undefined,true);
    const request=JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(request.messages[0].content).toBe('Return JSON. /no_think');
  });

  it('verifies structured tool-plan output instead of text inference alone',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'{"message":"Connection verified","actions":[]}'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const {testModel}=await import('../src/agent/providers');
    await expect(testModel(dockerSettings)).resolves.toContain('structured tool-plan test succeeded');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).response_format).toEqual({type:'json_object'});
  });

  it('distinguishes reachable models that fail to produce a JSON tool plan',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'I cannot return a plan.'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));
    const {testModel}=await import('../src/agent/providers');
    await expect(testModel(dockerSettings)).rejects.toThrow(/Inference succeeded, but .*did not return a JSON tool plan/);
  });

  it('discovers actual models from the OpenAI-compatible models endpoint',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      object:'list',
      data:[{id:'docker.io/ai/smollm2:360M-Q4_K_M',owned_by:'docker'}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));

    await expect(discoverModels(dockerSettings)).resolves.toEqual([
      {id:'ai/smollm2:360M-Q4_K_M',owned_by:'docker'}
    ]);
  });

  it('normalizes Docker Hub model IDs only for Docker Model Runner requests',async()=>{
    const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({
      choices:[{message:{content:'Agentix connection OK'}}]
    }),{status:200,headers:{'Content-Type':'application/json'}}));

    await askModel(dockerSettings,[{role:'user',content:'test'}]);
    const request=fetchMock.mock.calls[0][1];
    expect(JSON.parse(String(request?.body)).model).toBe('ai/smollm2:360M-Q4_K_M');
  });

  it('reports unreachable local endpoints with an actionable error',async()=>{
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(discoverModels({...dockerSettings,endpoint:'http://127.0.0.1:9/engines/v1'}))
      .rejects.toThrow(/Model discovery request to \/engines\/v1\/models could not reach.*Discovery is separate from inference/);
  });

  it('reports slow Qwen4B inference as a timeout rather than a connection failure',async()=>{
    vi.spyOn(globalThis,'fetch').mockRejectedValue(new DOMException('Request timed out','TimeoutError'));
    const qwenSettings={...dockerSettings,model:'huggingface.co/qwen/qwen3-4b-gguf:Q4_K_M'};
    await expect(askModel(qwenSettings,[{role:'user',content:'test'}]))
      .rejects.toThrow(/Model inference timed out after 240 seconds/);
  });

  it('distinguishes an unsupported discovery response from an empty model list',async()=>{
    vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({models:[]}),{status:200}));

    await expect(discoverModels(dockerSettings))
      .rejects.toThrow(/did not return the OpenAI-compatible \/models response shape/);
  });
});
