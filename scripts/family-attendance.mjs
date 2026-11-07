import assert from 'node:assert/strict'
import {familyAttendance} from '../lib/school/family-attendance.ts'
const entry={kind:'entry',occurred_at:'2026-11-07T12:00:00Z',is_late:false}
assert.equal(familyAttendance(null,null).state,'pending')
assert.match(familyAttendance(null,null).detail,/no confirma una inasistencia/)
assert.equal(familyAttendance(entry,entry).state,'inside')
assert.match(familyAttendance(entry,{...entry,kind:'exit'}).title,/ya salió/)
assert.match(familyAttendance(entry,{...entry,kind:'early_exit'}).title,/anticipadamente/)
assert.equal(familyAttendance(entry,{...entry,kind:'return'}).state,'inside')
assert.equal(familyAttendance(entry,entry,true).state,'unknown')
assert.ok(!familyAttendance(entry,entry,true).title.includes('Asistió'))
assert.match(familyAttendance(entry,entry,false,true).title,/sin salida registrada/)
console.log('PASS family attendance: first entry, exit, early exit, return, missing marking and load failures')
