import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, AUTH_EXPIRED_EVENT } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const navigateRef=useRef(navigate);
  useEffect(()=>{navigateRef.current=navigate;},[navigate]);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('eduglobal_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  const clearSession = () => {
    localStorage.removeItem('eduglobal_token');
    localStorage.removeItem('eduglobal_user');
    setUser(null);
  };

  const login = async (email, password) => {
    setLoading(true);
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      localStorage.setItem('eduglobal_token', data.token);
      localStorage.setItem('eduglobal_user', JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally { setLoading(false); }
  };

  const logout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  useEffect(() => {
    if (window.parent === window) return;
    const allowed=new Set([import.meta.env.VITE_STUDY_BIRDS_WEB_ORIGIN || 'https://studybirds.net','https://www.studybirds.net']);
    if (import.meta.env.DEV) allowed.add('http://localhost:5173');
    let parentOrigin;try {parentOrigin=new URL(document.referrer).origin;}catch{return;}
    if (!allowed.has(parentOrigin)) return;
    let pending=false;
    const receive=async(event)=>{
      if(event.source !== window.parent || event.origin !== parentOrigin || event.data?.type !== 'STUDY_BIRDS_CRM_SESSION' || typeof event.data.token !== 'string' || event.data.token.length>10000 || pending) return;
      pending=true;
      try {
        const response=await fetch(`${import.meta.env.VITE_API_URL || ''}/api/me`,{headers:{Authorization:`Bearer ${event.data.token}`}});
        if (!response.ok) throw new Error('SSO rejected');
        const account=await response.json();
        localStorage.setItem('eduglobal_token',event.data.token);localStorage.setItem('eduglobal_user',JSON.stringify(account));setUser(account);navigateRef.current('/',{replace:true});
      }catch {pending=false;window.parent.postMessage({type:'STUDY_BIRDS_CRM_ERROR'},parentOrigin);}
    };
    window.addEventListener('message',receive);window.parent.postMessage({type:'STUDY_BIRDS_CRM_READY'},parentOrigin);
    return()=>window.removeEventListener('message',receive);
  },[]);

  useEffect(() => {
    const handleSessionExpired = () => {
      clearSession();
      navigate('/login', { replace: true });
    };

    window.addEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handleSessionExpired);
  }, [navigate]);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
