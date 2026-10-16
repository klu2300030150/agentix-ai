import {describe,it,expect} from 'vitest';
import {parseToolPlan} from '../src/agent/tool-plan';

describe('tool plan parsing',()=>{
  it('accepts a concrete JSON plan',()=>{
    expect(parseToolPlan('{"message":"Inspecting","actions":[{"tool":"list_files","path":"."}]}').actions)
      .toEqual([{tool:'list_files',path:'.'}]);
  });

  it('normalizes the common action alias while still validating the tool name',()=>{
    expect(parseToolPlan('{"message":"Inspecting","actions":[{"action":"list_files","path":"."}]}').actions)
      .toEqual([{action:'list_files',path:'.',tool:'list_files'}]);
    expect(()=>parseToolPlan('{"actions":[{"action":"delete_workspace"}]}')).toThrow(/unsupported tool/);
  });

  it('extracts JSON wrapped in model prose and markdown',()=>{
    const response='Here is the plan:\n```json\n{"message":"Read app","actions":[{"tool":"read_file","path":"src/App.js"}]}\n```';
    expect(parseToolPlan(response).actions[0]).toEqual({tool:'read_file',path:'src/App.js'});
  });

  it('rejects write actions without a workspace-relative path',()=>{
    expect(()=>parseToolPlan('{"actions":[{"tool":"write_file","content":"export default 1"}]}'))
      .toThrow(/path.*content/i);
  });

  it('rejects schema alternatives instead of executable actions',()=>{
    expect(()=>parseToolPlan('{"actions":[{"tool":"list_files","path":"."}|{"tool":"read_file","path":"x"}]}'))
      .toThrow();
  });

  it('explains when a model responds in prose rather than a tool plan',()=>{
    expect(()=>parseToolPlan('Inspect the project and choose a tool.'))
      .toThrow(/plain text instead of the required JSON object.*structured tool instructions/i);
  });

  it('rejects copied example placeholders',()=>{
    expect(()=>parseToolPlan('{"message":"brief progress summary","actions":[{"tool":"read_file","path":"relative/path"}]}'))
      .toThrow(/placeholder/i);
  });
});
