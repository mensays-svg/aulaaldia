import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import { PNG } from 'pngjs'
import { QRCodeReader, RGBLuminanceSource, HybridBinarizer, BinaryBitmap } from '@zxing/library'
import { gateQrToken, limaDate } from '../lib/school/gate.ts'
let checks=0
const token='12345678-1234-4234-8234-123456789012'
const payload='aulaaldia:student:'+token
assert.equal(gateQrToken(payload),token);checks++
for(const value of ['12345678',token,'https://other.example/'+token,'aulaaldia:student:bad',payload+':extra']){assert.equal(gateQrToken(value),null);checks++}
assert.equal(limaDate(new Date('2026-11-06T02:00:00Z')),'2026-11-05');checks++
assert.equal(limaDate(new Date('2026-11-06T05:00:00Z')),'2026-11-06');checks++
const buffer=await QRCode.toBuffer(payload,{width:320,margin:3,errorCorrectionLevel:'M'})
const {width,height,data}=PNG.sync.read(buffer)
const pixels=new Uint8ClampedArray(width*height)
for(let i=0;i<pixels.length;i++)pixels[i]=(data[i*4]+2*data[i*4+1]+data[i*4+2])/4
const read=new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels,width,height))))
assert.equal(read.getText(),payload);checks++
assert.equal(gateQrToken(read.getText()),token);checks++
console.log(`${checks} QR encode/decode and Lima timezone checks passed`)
