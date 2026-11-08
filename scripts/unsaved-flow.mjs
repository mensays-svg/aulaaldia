import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
class Element {constructor(anchor){this.anchor=anchor}closest(){return this.anchor}}
class Form {constructor(action){this.action=action}}
globalThis.Element=Element;globalThis.HTMLFormElement=Form
globalThis.document=new EventTarget();globalThis.window=new EventTarget();globalThis.location={href:'https://school.example/dashboard/clases?school=one'};window.location=location
let confirmations=0,allow=false;window.confirm=()=>{confirmations++;return allow}
const cleanups=[],module={exports:{}},source=ts.transpileModule(readFileSync(new URL('../app/components/unsaved-changes.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
new Function('require','module','exports',source)(name=>{assert.equal(name,'react');return{useEffect:fn=>cleanups.push(fn())}},module,module.exports)
const {useUnsavedChanges,confirmLeavingDraft}=module.exports
function click(href,props={}){const event=new Event('click',{cancelable:true}),anchor={href,target:'',hasAttribute:()=>false,...props};Object.assign(event,{button:0,ctrlKey:false,metaKey:false,shiftKey:false,altKey:false});Object.defineProperty(event,'target',{value:new Element(anchor)});document.dispatchEvent(event);return event}
assert.equal(confirmLeavingDraft(),true)
useUnsavedChanges(true)
assert.equal(click('https://school.example/dashboard/comportamiento').defaultPrevented,true)
assert.equal(confirmations,1)
assert.equal(click(location.href+'#attendance').defaultPrevented,false)
assert.equal(click('https://school.example/dashboard/reportes/pdf').defaultPrevented,false)
assert.equal(click('https://school.example/dashboard/reportes',{target:'_blank'}).defaultPrevented,false)
assert.equal(confirmations,1)
const logout=new Event('submit',{cancelable:true});Object.defineProperty(logout,'target',{value:new Form('https://school.example/auth/signout')});document.dispatchEvent(logout);assert.equal(logout.defaultPrevented,true)
assert.equal(window.dispatchEvent(new Event('beforeunload',{cancelable:true})),false)
allow=true;assert.equal(click('https://school.example/dashboard/comportamiento').defaultPrevented,false)
useUnsavedChanges(true) // two dirty forms share one listener
const previous=confirmations;click('https://school.example/dashboard/reportes');assert.equal(confirmations,previous+1)
cleanups.shift()();assert.equal(window.dispatchEvent(new Event('beforeunload',{cancelable:true})),false)
cleanups.shift()();assert.equal(window.dispatchEvent(new Event('beforeunload',{cancelable:true})),true)
allow=false;const savedCount=confirmations;assert.equal(confirmLeavingDraft(),true);click('https://school.example/dashboard/reportes');assert.equal(confirmations,savedCount)
console.log('PASS unsaved flow: cancel/accept navigation, safe PDF/hash/new tab, logout, reload, multiple drafts and listener cleanup after save')
