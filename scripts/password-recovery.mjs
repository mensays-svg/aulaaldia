import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {pathToFileURL} from 'node:url'
import ts from 'typescript'
import {passwordValidation,passwordError,validRecoveryToken} from '../lib/supabase/password.ts'
// Execute the actual Server Actions with an isolated auth adapter; no mail or real users.
let ready=true,user={id:'test-user'},authFailure=null,otpSession={access_token:'test-token'},failure=null,signoutFailure=null,calls=[]
const adapter={auth:{
 async resetPasswordForEmail(email){calls.push(['recover',email]);return{error:failure}},
 async verifyOtp(value){calls.push(['verify',value]);return{data:{session:otpSession},error:failure}},
 async getUser(){calls.push(['user']);return{data:{user},error:authFailure}},
 async updateUser(value){calls.push(['update',value]);return{error:failure}},
 async signOut(value){calls.push(['signout',value]);return{error:signoutFailure}},
}}
globalThis.__passwordTest={configured:()=>ready,createClient:async()=>adapter,redirect:location=>{throw{location}}}
async function actionModule(path){
 let source=await readFile(new URL(path,import.meta.url),'utf8')
 source=source.replace(/import \{ redirect \} from 'next\/navigation'/,"const {redirect}=globalThis.__passwordTest")
 source=source.replace(/import \{ configured, createClient \} from '@\/lib\/supabase\/server'/,"const {configured,createClient}=globalThis.__passwordTest")
 source=source.replace("'@/lib/supabase/password'",JSON.stringify(pathToFileURL(process.cwd()+'/lib/supabase/password.ts').href))
 const {outputText}=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}})
 return import('data:text/javascript;base64,'+Buffer.from(outputText).toString('base64'))
}
const {requestRecovery,confirmRecovery}=await actionModule('../app/recuperar/actions.ts')
const {changePassword}=await actionModule('../app/dashboard/seguridad/actions.ts')
let checks=0
function check(value){assert.ok(value);checks++}
function form(values){const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,v);return f}
async function redirected(action,values,path,match){calls=[];let location;try{await action(form(values))}catch(e){location=e.location;if(!location)throw e}check(location);const url=new URL(location,'http://test');assert.equal(url.pathname,path);checks++;if(match){assert.match(url.searchParams.get('message')??'',match);checks++}return calls}
check(validRecoveryToken('a'.repeat(64)));check(validRecoveryToken('a'.repeat(56)));check(validRecoveryToken('pkce_'+'a'.repeat(56)));check(!validRecoveryToken('a'.repeat(257)));check(!validRecoveryToken('https://example.com'));check(!validRecoveryToken('{{ .TokenHash }}'));check(!validRecoveryToken('a'.repeat(55)+'<'))
check(passwordValidation('abc','abc'));check(passwordValidation('x'.repeat(129),'x'.repeat(129)));check(passwordValidation('valid-pass','different'));assert.equal(passwordValidation(' valid-pass ',' valid-pass '),null);checks++
check(passwordError({code:'same_password'}).includes('distinta'));check(passwordError({code:'reauthentication_needed'}).includes('nuevo enlace'));check(!passwordError({message:'secret smtp details'}).includes('secret'))
check((await redirected(requestRecovery,{email:'bad'},'/recuperar',/válido/)).length===0)
await redirected(requestRecovery,{email:'test@example.test'},'/recuperar',/Si existe/);assert.deepEqual(calls,[['recover','test@example.test']]);checks++
failure={code:'user_not_found',status:400};await redirected(requestRecovery,{email:'nobody@example.test'},'/recuperar',/Si existe/)
failure={status:429};await redirected(requestRecovery,{email:'test@example.test'},'/recuperar',/límite/)
failure={status:500,message:'private SMTP details'};await redirected(requestRecovery,{email:'test@example.test'},'/recuperar',/No se pudo/)
failure=null;ready=false;await redirected(requestRecovery,{email:'test@example.test'},'/login');ready=true
check((await redirected(confirmRecovery,{token_hash:'bad'},'/recuperar',/válido/)).length===0)
const token='pkce_'+'b'.repeat(56);await redirected(confirmRecovery,{token_hash:token},'/dashboard/seguridad');assert.deepEqual(calls,[['verify',{token_hash:token,type:'recovery'}]]);checks++
await redirected(confirmRecovery,{token_hash:'b'.repeat(56)},'/dashboard/seguridad');assert.deepEqual(calls,[['verify',{token_hash:'b'.repeat(56),type:'recovery'}]]);checks++
failure={code:'otp_expired'};await redirected(confirmRecovery,{token_hash:token},'/recuperar',/caducado/)
failure=null;otpSession=null;await redirected(confirmRecovery,{token_hash:token},'/recuperar',/caducado/);otpSession={access_token:'test-token'}
user=null;await redirected(changePassword,{password:'valid-pass',confirmation:'valid-pass'},'/login');check(!calls.some(c=>c[0]==='update'));user={id:'test-user'}
authFailure={status:401};await redirected(changePassword,{password:'valid-pass',confirmation:'valid-pass'},'/login');authFailure=null
await redirected(changePassword,{password:'short',confirmation:'short'},'/dashboard/seguridad',/8 a 128/);check(!calls.some(c=>c[0]==='update'))
await redirected(changePassword,{password:'valid-pass',confirmation:'different'},'/dashboard/seguridad',/no coinciden/);check(!calls.some(c=>c[0]==='update'))
failure={code:'same_password'};await redirected(changePassword,{password:'valid-pass',confirmation:'valid-pass'},'/dashboard/seguridad',/distinta/);check(!calls.some(c=>c[0]==='signout'))
failure=null;await redirected(changePassword,{password:' valid-pass ',confirmation:' valid-pass '},'/login',/actualizada/);assert.deepEqual(calls,[['user'],['update',{password:' valid-pass '}],['signout',{scope:'global'}]]);checks++
signoutFailure={status:503};await redirected(changePassword,{password:'valid-pass',confirmation:'valid-pass'},'/dashboard/seguridad',/actualizada/)
delete globalThis.__passwordTest
console.log(`${checks} password recovery, validation, session and privacy checks passed (mock auth; no real mail sent)`)
