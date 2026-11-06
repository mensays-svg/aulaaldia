import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
const school='00000000-0000-4000-8000-000000000001',lesson='00000000-0000-4000-8000-000000000002',student='00000000-0000-4000-8000-000000000003'
let calls=[],saveError=null,closeError=null
const supabase={rpc:async(name,args)=>{calls.push([name,args]);if(name==='save_class_attendance')return{data:8,error:saveError};if(name==='change_class_session_state')return{data:9,error:closeError};if(name==='class_session_detail')return{data:{id:lesson,revision:99,state:closeError?'draft':'closed'},error:null};throw Error('Unexpected RPC '+name)}}
globalThis.__quickAttendance={schoolContext:async()=>({supabase,school,roles:['docente'],user:{id:student}}),revalidatePath:()=>{}}
let source=await readFile(new URL('../app/dashboard/clases/actions.ts',import.meta.url),'utf8')
source=source.replace("import { revalidatePath } from 'next/cache'","const {revalidatePath}=globalThis.__quickAttendance").replace("import { schoolContext } from '@/lib/school/context'","const {schoolContext}=globalThis.__quickAttendance").replace("'@/lib/school/validation'",JSON.stringify(pathToFileURL(process.cwd()+'/lib/school/validation.ts').href)).replace("'@/lib/school/classes'",JSON.stringify(pathToFileURL(process.cwd()+'/lib/school/classes.ts').href))
const {outputText}=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}})
const {saveAttendance}=await import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'))
const marks=[{student_id:student,status:'present',note:''}]
let result=await saveAttendance(school,lesson,7,marks,'',true)
assert.ok(!result.error);assert.equal(calls[1][0],'change_class_session_state');assert.equal(calls[1][1].expected_revision,8);assert.equal(calls[1][1].new_state,'closed');assert.equal(calls[0][1].expected_revision,7)
// Never use the revision (99) from a later read to publish someone else's intervening edits.
assert.ok(!calls.some(([name,args])=>name==='change_class_session_state'&&args.expected_revision===99))
calls=[];closeError={message:'CLASS_STALE'};result=await saveAttendance(school,lesson,7,marks,'',true);assert.match(result.error,/guardada como borrador/);assert.equal(result.detail.state,'draft')
calls=[];saveError={message:'CLASS_FORBIDDEN'};result=await saveAttendance(school,lesson,7,marks,'',true);assert.ok(result.error);assert.equal(calls.length,1)
saveError=null;closeError=null;calls=[];result=await saveAttendance(school,lesson,7,marks,'');assert.ok(!result.error);assert.ok(!calls.some(([name])=>name==='change_class_session_state'))
calls=[];result=await saveAttendance(school,lesson,7,[{student_id:student,status:'justified',note:''}],'',true);assert.ok(result.error);assert.equal(calls.length,0)
calls=[];result=await saveAttendance(school,lesson,7,marks,'','yes');assert.ok(result.error);assert.equal(calls.length,0)
delete globalThis.__quickAttendance
console.log('PASS quick attendance: exact saved revision, publish success, concurrent changes, partial failure, forbidden save, draft-only, justification and input validation')
