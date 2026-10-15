import React,{createContext,useCallback,useContext,useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {useAuth} from '../auth.jsx';
import {Button,Modal} from './UI.jsx';
import {websiteSections} from '../websiteSections.js';
const empty={resources:{},states:{},checkedAt:'',observe:async()=>({}),mark:async()=>{},refresh:()=>{}};
const Context=createContext(empty);
export const useSharedRead=()=>useContext(Context);
export function SharedReadProvider({children}){
 const {user}=useAuth();const [summary,setSummary]=useState({resources:{}}),[states,setStates]=useState({});const active=useRef(true),generation=useRef(0),sequence=useRef(0),queue=useRef(new Map()),timer=useRef(null);
 const refresh=useCallback(async()=>{const current=generation.current,request=++sequence.current;try{const data=await api('/api/read-state');if(active.current && current===generation.current && request===sequence.current)setSummary(old=>({...data,resources:{...Object.fromEntries(Object.entries(old.resources || {}).filter(([key])=>data.errors?.[key] || data.errors?.website && !key.startsWith('crm:'))),...data.resources}}));}catch(error){if(active.current && current===generation.current && request===sequence.current)setSummary(old=>({...old,unavailable:true}));}},[user?.id]);
 useEffect(()=>{active.current=true;generation.current++;setStates({});setSummary({resources:{}});void refresh();const update=()=>{if(!document.hidden)void refresh();};const interval=setInterval(update,15000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);window.addEventListener('shared-read-changed',update);return()=>{active.current=false;generation.current++;clearInterval(interval);clearTimeout(timer.current);for(const job of queue.current.values())for(const callback of job.waiters)callback.reject(new Error('Session changed'));queue.current.clear();window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);window.removeEventListener('shared-read-changed',update);};},[refresh]);
 const observe=useCallback((resource,ids)=>new Promise((resolve,reject)=>{
  if(!active.current || !ids.length){resolve({});return;}
  if(!queue.current.has(resource))queue.current.set(resource,{ids:new Set(),waiters:[]});const job=queue.current.get(resource);ids.forEach(id=>job.ids.add(id));job.waiters.push({resolve,reject});
  if(timer.current)return;
  timer.current=setTimeout(async()=>{timer.current=null;const jobs=[...queue.current];queue.current.clear();const current=generation.current;
   for(const [key,work] of jobs){try{const result={};const ids=[...work.ids];for(let offset=0;offset<ids.length;offset+=100)Object.assign(result,await api(`/api/read-state/${key}/states`,{method:'POST',body:JSON.stringify({ids:ids.slice(offset,offset+100)})}));if(active.current && current===generation.current){setStates(old=>({...old,...Object.fromEntries(Object.entries(result).map(([id,value])=>[key+':'+id,value]))}));work.waiters.forEach(w=>w.resolve(result));}else work.waiters.forEach(w=>w.reject(new Error('Session changed')));}catch(error){work.waiters.forEach(w=>w.reject(error));}}
  },0);
 }),[]);
 const mark=useCallback(async snapshot=>{
  if(!snapshot?.unread)return;
  const current=generation.current;const saved=await api(`/api/read-state/${snapshot.resource}/${snapshot.id}/read`,{method:'POST',body:JSON.stringify({version:snapshot.version})});
  if(active.current && current===generation.current){setStates(old=>({...old,[snapshot.resource+':'+snapshot.id]:saved}));await refresh();window.dispatchEvent(new Event('shared-read-changed'));}
 },[refresh]);
 return <Context.Provider value={{...summary,states,observe,mark,refresh}}>{children}</Context.Provider>;
}
export function ReadCount({resources}){const state=useSharedRead();const groups={};for(const key of resources || []){const item=state.resources[key];if(item)groups[item.canonical]=Math.max(groups[item.canonical] || 0,item.unread);}const count=Object.values(groups).reduce((a,b)=>a+b,0);return count>0?<span className="shared-read-count" title="غير مقروء — القراءة مشتركة بين الموظفين" aria-label={`${count} غير مقروء`}>{count>999?'999+':count}</span>:null;}
const nativeModules={students:['students'],admissions:['applications'],finance:['invoices','payments'],consultancy:['leads'],hr:['employees'],inbox:['conversations','mail'],tasks:['tasks'],reminders:['reminders'],calls:['calls'],scripts:['scripts'],leave:['leave']};
export function ModuleReadCount({module}){return <ReadCount resources={[...(websiteSections[module] || []),...(module==='inbox'?['messaging']:[]),...(nativeModules[module] || []).map(key=>'crm:'+key)]}/>;}
function identity(record,resource,id){const source=record?.websiteSource;return source?.id || source?.record?._id?{resource:source.resource,id:source.id || source.record._id}:{resource,id:id || record?.suspensionId || record?._id || record?.id};}
export function RecordUnread({record,resource,id}){
 const read=useSharedRead(),key=identity(record,resource,id);const value=read.states[key.resource+':'+key.id] || record?.__read;
 useEffect(()=>{if(key.id && key.resource && key.resource!=='employeeStats')read.observe(key.resource,[key.id]).catch(()=>{});},[key.resource,key.id,read.checkedAt,record?.updatedAt]);
 return value?.unread?<span className="shared-read-count" title="لم يفتح هذا الإصدار أي موظف بعد">{value.readAt?'تحديث جديد':'جديد'}</span>:null;
}
export function ReadRecord({record,resource,id}){
 const read=useSharedRead(),key=identity(record,resource,id);const [error,setError]=useState('');
 useEffect(()=>{let active=true;const mark=async()=>{if(document.hidden || !key.id || !key.resource || key.resource==='employeeStats')return;try{const states=await read.observe(key.resource,[key.id]);if(active)await read.mark(record?.__read || states[key.id]);if(active)setError('');}catch(error){if(active)setError(error.message);}};void mark();window.addEventListener('focus',mark);return()=>{active=false;window.removeEventListener('focus',mark);};},[key.resource,key.id,record?.updatedAt]);
 return error?<p className="website-hint" role="status">تعذر تحديث علامة القراءة: {error}</p>:null;
}

export function NativeUnreadPanel({module}){
 const read=useSharedRead(),[open,setOpen]=useState(false),[resource,setResource]=useState(''),[items,setItems]=useState([]),[detail,setDetail]=useState(null),[error,setError]=useState('');
 const keys=(nativeModules[module] || []).map(key=>'crm:'+key).filter(key=>read.resources[key]?.unread>0);
 async function load(key){setResource(key);setDetail(null);setError('');try{const data=await api(`/api/read-state/${key}/unread`);setItems(data.items);}catch(error){setError(error.message);}}
 async function show(id){setError('');try{const data=await api(`/api/read-state/${resource}/${id}/detail`);setDetail(data);}catch(error){setError(error.message);}}
 const labels={name:'الاسم',title:'العنوان',email:'الإيميل',phone:'الهاتف',nationality:'الجنسية',notes:'ملاحظات',status:'الحالة',university:'الجامعة',program:'البرنامج',country:'الدولة',intake:'الفصل الدراسي',amount:'المبلغ',total:'الإجمالي',paid:'المدفوع',currency:'العملة',description:'التفاصيل',dueDate:'الموعد',number:'الرقم',subject:'الموضوع',message:'الرسالة',text:'النص',content:'المحتوى',createdAt:'تاريخ الإنشاء',updatedAt:'آخر تحديث'};
 return <>{keys.length>0 && <Button variant="secondary" onClick={()=>{setOpen(true);load(keys[0]);}}>عناصر غير مقروءة <ReadCount resources={keys}/></Button>}<Modal open={open} onClose={()=>setOpen(false)} title="العناصر غير المقروءة — قراءة مشتركة" size="lg"><p className="website-hint">فتح تفاصيل العنصر يزيل علامة غير المقروء للجميع، دون تغيير حالة المعالجة.</p><div className="table-actions">{keys.map(key=><Button key={key} variant="secondary" onClick={()=>load(key)}>{{students:'الطلاب',applications:'الطلبات',invoices:'الفواتير',payments:'سندات الدفع',leads:'العملاء المحتملون',tasks:'المهام',reminders:'التذكيرات',calls:'المكالمات',scripts:'الاسكريبتات',employees:'الموظفون',conversations:'المحادثات',mail:'البريد',leave:'الإجازات'}[key.slice(4)] || key.slice(4)} <ReadCount resources={[key]}/></Button>)}</div>{error && <p role="alert">{error}</p>}{detail?<><ReadRecord resource={resource} record={{...detail.record,__read:detail.state}}/><dl className="website-details">{Object.entries(detail.record).map(([key,value])=><div key={key}><dt>{labels[key] || key}</dt><dd>{typeof value==='object'?JSON.stringify(value):String(value)}</dd></div>)}</dl><Button variant="secondary" onClick={()=>load(resource)}>رجوع للقائمة</Button></>:items.map(item=><div className="student-card-row" key={item.id}><span>{item.title}</span><Button onClick={()=>show(item.id)}>عرض التفاصيل</Button></div>)}</Modal></>;
}
