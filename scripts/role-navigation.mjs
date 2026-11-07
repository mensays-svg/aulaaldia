import assert from 'node:assert/strict'
import {roleNavigation,roleHome,schoolHref} from '../lib/school/navigation.ts'
let checks=0
const ids=roles=>roleNavigation(roles).map(n=>n.id)
for(const role of ['docente','auxiliar','apoderado']){
 assert.ok(!ids([role]).includes('direction'));assert.ok(!ids([role]).includes('people'));checks+=2
}
assert.ok(!ids(['auxiliar']).includes('behavior'));checks++
assert.ok(!ids(['auxiliar']).includes('classes'));checks++
assert.ok(ids(['docente']).includes('teacherReports'));checks++
assert.ok(!ids(['docente']).includes('reports'));checks++
assert.ok(!ids(['docente','apoderado']).includes('reports'));checks++
assert.ok(!ids(['docente']).includes('enrollment'));checks++
assert.ok(!ids(['docente']).includes('students'));checks++
assert.ok(!ids(['docente']).includes('rooms'));checks++
assert.ok(!ids(['auxiliar']).includes('enrollment'));checks++
assert.ok(!ids(['auxiliar']).includes('rooms'));checks++
assert.ok(ids(['auxiliar']).includes('gateRooms'));checks++
assert.ok(ids(['auxiliar']).includes('reports'));checks++
for(const role of ['director','administrador']){assert.ok(ids([role]).includes('direction'));assert.ok(ids([role]).includes('people'));checks+=2}
for(const [role,primary]of Object.entries({director:'direction',administrador:'people',auxiliar:'gate',docente:'classes',apoderado:'reports'})){
 const home=roleHome([role]);assert.equal(home.primary,primary);assert.ok(ids([role]).includes(home.primary));assert.ok(home.cards.every(id=>ids([role]).includes(id)));checks+=3
}
assert.equal(roleHome(['apoderado','docente']).primary,'classes');checks++
assert.equal(roleHome(['auxiliar','director']).primary,'direction');checks++
assert.ok(ids(['auxiliar','docente']).includes('classes'));checks++
assert.equal(new Set(ids(['auxiliar','docente'])).size,ids(['auxiliar','docente']).length);checks++
assert.deepEqual(ids([]),['overview']);checks++
assert.equal(schoolHref('/dashboard#people','school-id'),'/dashboard?school=school-id#people');checks++
assert.equal(schoolHref('/dashboard/reportes','school-id'),'/dashboard/reportes?school=school-id');checks++
assert.equal(schoolHref('/dashboard'),'/dashboard');checks++
assert.ok(!roleNavigation(['apoderado']).find(n=>n.id==='classes').description.includes('registra'));checks++
assert.ok(roleNavigation(['auxiliar']).find(n=>n.id==='gate').description.includes('Registra'));checks++
console.log(`${checks} role navigation, task priority, multi-role and school-link checks passed`)
