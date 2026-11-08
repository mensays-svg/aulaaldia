import type {schoolContext} from './context'
type Context=Awaited<ReturnType<typeof schoolContext>>
export type FamilyChild={id:string;first_names:string;last_names:string}
export async function familyChildren({supabase,school,user}:Context):Promise<{children:FamilyChild[];error:boolean}>{
 if(!school)return{children:[],error:true}
 const ids:string[]=[]
 for(let offset=0;;offset+=500){const result=await supabase.from('student_guardians').select('student_id').eq('institution_id',school).eq('user_id',user.id).order('student_id').range(offset,offset+499);if(result.error)return{children:[],error:true};ids.push(...(result.data??[]).map(r=>r.student_id));if((result.data?.length??0)<500)break}
 if(!ids.length)return{children:[],error:false}
 const children:FamilyChild[]=[]
 for(let offset=0;offset<ids.length;offset+=100){const result=await supabase.from('students').select('id,first_names,last_names').eq('institution_id',school).in('id',ids.slice(offset,offset+100)).order('last_names');if(result.error)return{children:[],error:true};children.push(...(result.data??[]))}
 return{children:children.sort((a,b)=>a.last_names.localeCompare(b.last_names,'es')),error:false}
}
export function familySelection(children:FamilyChild[],requested?:string){return requested?children.find(c=>c.id===requested):children[0]}
