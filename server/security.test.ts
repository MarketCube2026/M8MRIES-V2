import {describe,it,expect,vi} from 'vitest';
import {authentication,requireRoles,scope} from './security';
import {validateFile} from './storage';
describe('server authorization',()=>{
  it('rejects forged x-role without a verified token',async()=>{
    const next=vi.fn();await authentication({}, {})({headers:{'x-role':'APPROVER'}} as any,{} as any,next);
    expect(next.mock.calls[0][0].status).toBe(401);
  });
  it('uses server-stored role instead of user metadata or headers',async()=>{
    const next=vi.fn();const req:any={headers:{authorization:'Bearer verified','x-role':'APPROVER'}};
    await authentication({auth:{getUser:async()=>({data:{user:{id:'u',user_metadata:{role:'APPROVER'}}}})}},
      {userAccess:{findUnique:async()=>({active:true,role:'APPLICANT'})}})(req,{} as any,next);
    expect(req.identity.role).toBe('APPLICANT');
    requireRoles('APPROVER')(req,{} as any,next);
    expect(next.mock.calls.at(-1)?.[0].status).toBe(403);
    expect(scope(req.identity)).toEqual({ownerId:'u'});
  });
  it('rejects an image filename with executable bytes',()=>{
    expect(()=>validateFile({buffer:Buffer.from('MZ executable'),mimetype:'image/png'} as any)).toThrow();
  });
});
