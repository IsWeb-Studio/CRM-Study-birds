import React,{useState} from 'react';
import {Card} from './UI.jsx';
import SourceRecordActions from './SourceRecordActions.jsx';
export default function UniversityDirectory({universities}){
 const [query,setQuery]=useState('');
 const rows=universities.filter(row=>[row.name,row.country,row.city].join(' ').toLowerCase().includes(query.trim().toLowerCase()));
 return <Card><div className="panel-toolbar"><h2>الجامعات ({universities.length})</h2><label className="field"><span>بحث الجامعات</span><input type="search" placeholder="ابحث عن جامعة أو دولة أو مدينة" value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="catalog-table-wrap"><table className="catalog-table"><thead><tr><th>الجامعة</th><th>الدولة</th><th>المدينة</th><th>الإجراءات</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.name}</td><td>{row.country || '—'}</td><td>{row.city || '—'}</td><td><SourceRecordActions record={row} label="تعديل الجامعة"/></td></tr>)}</tbody></table></div>{!rows.length && <p>لا توجد جامعات مطابقة للبحث.</p>}</Card>;
}
