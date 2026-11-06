'use client'
import {useState} from 'react'
import {normalizeGrade} from '@/lib/school/student-import'
import type {ManagementFilters} from '@/lib/school/management-reports'
type Period={id:string;name:string;academic_year:number;starts_on:string;ends_on:string}
type Room={academic_year:number;level:string;grade:string;section:string}
export default function ManagementFilterForm({school,periods,rooms,initial,periodId,today,historical=false}:{school:string;periods:Period[];rooms:Room[];initial:ManagementFilters;periodId:string;today:string;historical?:boolean}){
 const[year,setYear]=useState(initial.year),[period,setPeriod]=useState(periodId),[level,setLevel]=useState(initial.level??''),[grade,setGrade]=useState(initial.grade?normalizeGrade(initial.grade):''),[section,setSection]=useState(initial.section?.toUpperCase()??'')
 const years=[...new Set(periods.map(p=>p.academic_year))].sort((a,b)=>b-a)
 const available=rooms.filter(r=>r.academic_year===year&&(!level||r.level===level))
 const grades=[...new Set(available.map(r=>normalizeGrade(r.grade)))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}))
 const sections=[...new Set(available.filter(r=>!grade||normalizeGrade(r.grade)===grade).map(r=>r.section.trim().toUpperCase()))].sort((a,b)=>a.localeCompare(b,'es'))
 function changeYear(value:number){setYear(value);const options=periods.filter(p=>p.academic_year===value);setPeriod((options.find(p=>p.starts_on<=today&&p.ends_on>=today)??options.find(p=>p.starts_on<=today)??options[0])?.id??'');setLevel('');setGrade('');setSection('')}
 return <form method="get" className="grid-form"><input name="school" value={school} type="hidden"/>
  <label>Año escolar<select name="year" value={year} onChange={e=>changeYear(Number(e.target.value))} required>{years.map(y=><option key={y} value={y}>{y}</option>)}</select></label>
  <label>Periodo<select name="period" value={period} onChange={e=>setPeriod(e.target.value)} required>{periods.filter(p=>p.academic_year===year).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
  <label>Nivel<select name="level" value={level} onChange={e=>{setLevel(e.target.value);setGrade('');setSection('')}}><option value="">Todos los niveles</option>{['Inicial','Primaria','Secundaria'].map(l=><option key={l}>{l}</option>)}</select></label>
  <label>Grado / edad de Inicial<select name="grade" value={grade} onChange={e=>{setGrade(e.target.value);setSection('')}}><option value="">Todos los grados</option>{grades.map(g=><option key={g}>{g}</option>)}</select></label>
  <label>Sección<select name="section" value={section} onChange={e=>setSection(e.target.value)}><option value="">Todas las secciones</option>{sections.map(s=><option key={s}>{s}</option>)}</select></label>
  <label>{historical?'Estado de matrícula al corte':'Estado del estudiante'}<select name="state" defaultValue={initial.state}><option value="all">{historical?'Todos los estados de matrícula':'Activos e inactivos'}</option><option value="active">{historical?'Matrículas activas al corte':'Solo activos'}</option><option value="inactive">{historical?'Matrículas retiradas al corte':'Solo inactivos'}</option></select></label>
  <button>Aplicar filtros</button><p>Aplica los filtros para actualizar el reporte antes de descargar.</p>
 </form>
}
