import { useEffect, useState, type ReactNode } from 'react';
import { auth, localMode } from './api';

type AuthMode = 'login' | 'recovery';

function recoveryCallbackPresent() {
  return window.location.hash.includes('type=recovery') ||
    new URLSearchParams(window.location.search).get('type') === 'recovery';
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [mode, setMode] = useState<AuthMode>(() => recoveryCallbackPresent() ? 'recovery' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (localMode) {
      setSignedIn(true);
      setReady(true);
      return;
    }
    if (!auth) {
      setReady(true);
      return;
    }
    void auth.auth.getSession().then(({ data }) => {
      setSignedIn(Boolean(data.session));
      setReady(true);
    });
    const { data } = auth.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setMode('recovery');
      if (event === 'SIGNED_OUT') setMode('login');
      setSignedIn(Boolean(session));
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="emptyState">正在检查登录...</div>;

  if (mode === 'recovery') {
    return <div className="authPage"><form className="authForm" onSubmit={async event => {
      event.preventDefault();
      setError('');
      setMessage('');
      if (password.length < 8) {
        setError('新密码至少需要 8 个字符');
        return;
      }
      if (password !== passwordAgain) {
        setError('两次输入的密码不一致');
        return;
      }
      if (!auth) return;
      setBusy(true);
      try {
        const result = await auth.auth.updateUser({ password });
        if (result.error) throw result.error;
        await auth.auth.signOut();
        window.history.replaceState({}, '', window.location.pathname);
        setPassword('');
        setPasswordAgain('');
        setMode('login');
        setMessage('密码已更新，请使用新密码登录');
      } catch {
        setError('重置链接已失效或密码更新失败，请重新发送重置邮件');
      } finally {
        setBusy(false);
      }
    }}>
      <h1>设置新密码</h1>
      <p>请输入两次新密码，提交后返回登录页。</p>
      <label>新密码<input type="password" autoComplete="new-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <label>确认新密码<input type="password" autoComplete="new-password" required value={passwordAgain} onChange={event => setPasswordAgain(event.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? '正在更新...' : '确认修改密码'}</button>
      {error && <p className="authError">{error}</p>}
    </form></div>;
  }

  if (signedIn) return <>{children}</>;

  return <div className="authPage"><form className="authForm" onSubmit={async event => {
    event.preventDefault();
    if (!auth) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await auth.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
    } catch {
      setError('登录失败，请检查账号密码或联系管理员');
    } finally {
      setBusy(false);
    }
  }}>
    <h1>审批智评</h1>
    {!auth ? <p>请配置 Supabase 登录服务后使用。</p> : <>
      <label>邮箱<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>密码<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      <button className="primary" disabled={busy}>{busy ? '登录中...' : '登录'}</button>
      <button type="button" className="textBtn" disabled={busy || !email} onClick={async () => {
        if (!auth) return;
        setBusy(true);
        setError('');
        setMessage('');
        try {
          const result = await auth.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/` });
          if (result.error) throw result.error;
          setMessage('重置邮件已发送，请检查收件箱');
        } catch {
          setError('重置邮件发送失败，请稍后重试');
        } finally {
          setBusy(false);
        }
      }}>忘记密码</button>
    </>}
    {message && <p className="authMessage">{message}</p>}
    {error && <p className="authError">{error}</p>}
  </form></div>;
}
