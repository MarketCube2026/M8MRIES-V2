import { useEffect, useState, type ReactNode } from 'react';
import { auth } from './api';
export function AuthGate({ children }: { children: ReactNode }) {
  const [ready,setReady]=useState(false);
  const [signedIn,setSignedIn]=useState(false);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(!auth){setReady(true);return;}
    void auth.auth.getSession().then(({data})=>{setSignedIn(!!data.session);setReady(true);});
    const {data}=auth.auth.onAuthStateChange((_event,session)=>setSignedIn(!!session));
    return ()=>data.subscription.unsubscribe();
  },[]);
  if(!ready)return <div className="emptyState">正在检查登录…</div>;
  if(signedIn)return <>{children}</>;
  return <div className="emptyState"><h1>审批智评</h1>{!auth?<p>请配置 Supabase 登录服务后使用。</p>:<form onSubmit={async(e)=>{
    e.preventDefault();setBusy(true);setError('');
    try{const result=await auth!.auth.signInWithPassword({email,password});if(result.error)throw result.error;}
    catch{setError('登录失败，请检查账号密码或联系管理员');}finally{setBusy(false);}
  }}><label>邮箱<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>密码<input type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary" disabled={busy}>{busy?'登录中…':'登录'}</button><p>{error}</p></form>}</div>;
}
