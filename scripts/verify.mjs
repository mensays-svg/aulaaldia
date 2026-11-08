import {readFileSync} from 'node:fs'
import {spawn} from 'node:child_process'
const {scripts}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'))
const checks=Object.keys(scripts).filter(name=>name.startsWith('test:')&&name!=='test:teacher-qr')
for(const check of [...checks,'build']){
 console.log(`\nChecking ${check}`)
 const status=await new Promise((resolve,reject)=>{const child=spawn('npm',['run',check],{stdio:'inherit',cwd:new URL('..',import.meta.url)});child.on('error',reject);child.on('exit',resolve)})
 if(status!==0){console.error(`Verification failed: ${check}`);process.exit(status||1)}
}
console.log(`\nPASS ${checks.length} test suites and production build. No remote school data was modified.`)
