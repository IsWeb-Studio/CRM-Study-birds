import React,{useEffect,useId,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
export default function CatalogMultiFilter({label,options,value,onChange}) {
 const [open,setOpen]=useState(false),[query,setQuery]=useState('');const root=useRef(null),id=useId();
 useEffect(()=>{if(!open)return;const outside=e=>{if(!root.current?.contains(e.target))setOpen(false);};const escape=e=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};},[open]);
 const shown=options.filter(item=>item.toLowerCase().includes(query.trim().toLowerCase()));
 return <div className="field"><span id={`${id}-label`}>{label}</span><div className="multi-select" ref={root}>
  <button type="button" className={`multi-select-trigger ${open?'is-open':''}`} aria-labelledby={`${id}-label`} aria-expanded={open} aria-controls={`${id}-menu`} onClick={()=>{setOpen(!open);setQuery('');}}><span className="catalog-filter-summary" title={value.join('، ')}>{!value.length?'الكل':value.length===1?value[0]:`${value.length} محدد`}</span><ChevronDown size={14}/></button>
  {open && <div className="multi-select-menu" id={`${id}-menu`}><input className="catalog-filter-select" type="search" aria-label={`بحث في ${label}`} placeholder="بحث..." value={query} onChange={e=>setQuery(e.target.value)}/><button className="btn btn-ghost" type="button" onClick={()=>onChange([])}>إلغاء التحديد</button>{shown.map(item=><label className="multi-select-option" key={item}><input type="checkbox" checked={value.includes(item)} onChange={()=>onChange(value.includes(item)?value.filter(entry=>entry!==item):[...value,item])}/><span>{item}</span></label>)}{!shown.length && <p className="multi-select-empty">لا توجد خيارات.</p>}</div>}
 </div></div>;
}
