import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assertPrivateStorage } from './storage-audit.mjs'

export const previewBodies = new Map()
export async function attachmentPreviews({ evaluate, navigate, waitText, until, tickets, requests, send }) {
  const original = tickets[0].attachments
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXZkAAAAASUVORK5CYII=', 'base64')
  const encoded = await evaluate(`(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    canvas.getContext('2d').fillStyle = 'blue'; canvas.getContext('2d').fillRect(0,0,32,32);
    const output = {};
    for (const codec of ['vp8', 'avc1.42001E']) {
      let data, description;
      const encoder = new VideoEncoder({ output: (chunk, metadata) => {
        data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
        if (metadata.decoderConfig?.description) description = new Uint8Array(metadata.decoderConfig.description);
      }, error: error => { throw error } });
      encoder.configure({ codec, width: 32, height: 32, bitrate: 100000, framerate: 1, ...(codec.startsWith('avc') ? {avc: {format: 'avc'}} : {}) });
      const frame = new VideoFrame(canvas, { timestamp: 0, duration: 1000000 });
      encoder.encode(frame, { keyFrame: true }); frame.close(); await encoder.flush(); encoder.close();
      output[codec] = { frame: btoa(String.fromCharCode(...data)), config: description ? btoa(String.fromCharCode(...description)) : null };
    }
    return output;
  })()`)
  const element = (hex, ...parts) => {
    const data = Buffer.concat(parts), length = data.length < 127 ? Buffer.from([0x80 | data.length]) : Buffer.from([0x40 | (data.length >> 8), data.length & 255]);
    return Buffer.concat([Buffer.from(hex, 'hex'), length, data])
  }
  const integer = (hex, n) => element(hex, Buffer.from([n]))
  const duration = Buffer.alloc(8); duration.writeDoubleBE(1000)
  const webm = Buffer.concat([
    element('1a45dfa3', integer('4286', 1), integer('42f7', 1), integer('42f2', 4), integer('42f3', 8), element('4282', Buffer.from('webm')), integer('4287', 4), integer('4285', 2)),
    element('18538067', element('1549a966', element('2ad7b1', Buffer.from([15, 66, 64])), element('4489', duration), element('4d80', Buffer.from('EDS test')), element('5741', Buffer.from('EDS test'))),
      element('1654ae6b', element('ae', integer('d7', 1), integer('73c5', 1), integer('83', 1), element('86', Buffer.from('V_VP8')), element('e0', integer('b0', 32), integer('ba', 32)))),
      element('1f43b675', integer('e7', 0), element('a3', Buffer.from([0x81, 0, 0, 0x80]), Buffer.from(encoded.vp8.frame, 'base64')))),
  ])
  const box = (type, ...parts) => { const data = Buffer.concat(parts), header = Buffer.alloc(8); header.writeUInt32BE(data.length + 8); header.write(type, 4); return Buffer.concat([header, data]) }
  const words = (...values) => { const data = Buffer.alloc(values.length * 4); values.forEach((value, i) => data.writeUInt32BE(value, i * 4)); return data }
  const avc = Buffer.from(encoded['avc1.42001E'].frame, 'base64')
  const ftyp = box('ftyp', Buffer.from('isom'), words(512), Buffer.from('isomiso2avc1mp41'))
  const mvhd = Buffer.alloc(100); mvhd.writeUInt32BE(1000, 12); mvhd.writeUInt32BE(1000, 16); mvhd.writeUInt32BE(65536, 20); mvhd.writeUInt16BE(256, 24); mvhd.writeUInt32BE(2, 96)
  const tkhd = Buffer.alloc(84); tkhd.writeUInt32BE(7); tkhd.writeUInt32BE(1, 12); tkhd.writeUInt32BE(1000, 20); tkhd.writeUInt32BE(32 * 65536, 76); tkhd.writeUInt32BE(32 * 65536, 80)
  for (const [buffer, start] of [[mvhd, 36], [tkhd, 40]]) { buffer.writeUInt32BE(65536, start); buffer.writeUInt32BE(65536, start+16); buffer.writeUInt32BE(0x40000000, start+32) }
  const mdhd = Buffer.alloc(24); mdhd.writeUInt32BE(1000, 12); mdhd.writeUInt32BE(1000, 16); mdhd.writeUInt16BE(0x55c4, 20)
  const hdlr = Buffer.alloc(25); hdlr.write('vide', 8)
  const visual = Buffer.alloc(78); visual.writeUInt16BE(1, 6); visual.writeUInt16BE(32, 24); visual.writeUInt16BE(32, 26); visual.writeUInt32BE(72 * 65536, 28); visual.writeUInt32BE(72 * 65536, 32); visual.writeUInt16BE(1, 40); visual.writeUInt16BE(24, 74); visual.writeInt16BE(-1, 76)
  const mp4 = Buffer.concat([ftyp, box('mdat', avc), box('moov', box('mvhd', mvhd), box('trak', box('tkhd', tkhd), box('mdia', box('mdhd', mdhd), box('hdlr', hdlr), box('minf', box('vmhd', words(1,0,0)), box('dinf', box('dref', words(0,1), box('url ', words(1)))), box('stbl', box('stsd', words(0,1), box('avc1', visual, box('avcC', Buffer.from(encoded['avc1.42001E'].config, 'base64')))), box('stts', words(0,1,1,1000)), box('stsc', words(0,1,1,1,1)), box('stsz', words(0,avc.length,1)), box('stco', words(0,1,ftyp.length+8)))))))])
  previewBodies.set(9101, { contentType: 'image/png', bytes: png })
  if (process.env.UPDATE_VIDEO_FIXTURES === '1') {
    const directory = resolve(import.meta.dirname, '../../server/test/fixtures')
    mkdirSync(directory, { recursive: true })
    writeFileSync(resolve(directory, 'browser-evidence.webm'), webm)
    writeFileSync(resolve(directory, 'browser-evidence.mp4'), mp4)
  }
  previewBodies.set(9102, { contentType: 'video/webm', bytes: webm })
  previewBodies.set(9103, { contentType: 'video/mp4', bytes: mp4 })
  tickets[0].attachments = [...original, ...[9101, 9102, 9103].map(id => ({ id, filename: id === 9101 ? 'private.png' : id === 9102 ? 'private.webm' : 'private.mp4', contentType: previewBodies.get(id).contentType, byteSize: previewBodies.get(id).bytes.length, createdAt: new Date().toISOString(), deletedAt: null }))]
  await navigate('/tickets/142'); await waitText('private.png')
  await evaluate(`(() => {
    window.previewUrls = []; window.revokedUrls = [];
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    URL.createObjectURL = blob => { const url = create(blob); window.previewUrls.push(url); return url };
    URL.revokeObjectURL = url => { window.revokedUrls.push(url); revoke(url) };
  })()`)
  assert(!requests.some(path => path.includes('/attachments/910')))
  assert.equal(await evaluate('document.querySelectorAll(".attachment-card").length'), 4)
  await evaluate(`document.querySelector('[aria-label="Preview private.png"]').click()`)
  await until(() => evaluate('!!document.querySelector("img.attachment-preview")?.naturalWidth'), 'authorized PNG thumbnail')
  assert(await evaluate('document.querySelector("img.attachment-preview").src.startsWith("blob:")'))
  await evaluate(`document.querySelector('[aria-label="Hide private.png"]').click()`)
  await until(() => evaluate('window.revokedUrls.length === 1'), 'hidden image URL revoked')
  previewBodies.get(9101).denied = true
  await evaluate(`document.querySelector('[aria-label="Preview private.png"]').click()`)
  await waitText('could not be found or is no longer available')
  assert(await evaluate('!document.querySelector("img.attachment-preview")'))
  previewBodies.get(9101).denied = false
  await evaluate(`document.querySelector('[aria-label="Hide private.png"]').click()`)
  await evaluate(`document.querySelector('[aria-label="Preview private.webm"]').click()`)
  await until(() => evaluate('!!document.querySelector("video.attachment-preview")'), 'WebM video player')
  assert(await evaluate('(() => { const v = document.querySelector("video"); return v.controls && !v.autoplay && v.preload === "metadata" && v.src.startsWith("blob:") })()'))
  await until(() => evaluate('document.querySelector("video").readyState >= 1'), 'real browser-encoded WebM metadata').catch(async error => { console.error('Video diagnostics', webm.length, await evaluate('({error: document.querySelector("video").error?.message, network: document.querySelector("video").networkState})')); throw error })
  await evaluate('document.querySelector("video").focus()')
  assert(await evaluate('document.activeElement.tagName === "VIDEO"'))
  await evaluate(`document.querySelector('[aria-label="Preview private.mp4"]').click()`)
  await until(() => evaluate('document.querySelectorAll("video.attachment-preview").length === 2'), 'MP4 video card')
  await until(() => evaluate('[...document.querySelectorAll("video.attachment-preview")].every(video => video.readyState >= 1)'), 'real MP4 and WebM metadata')
  for (const width of [768, 390]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width === 390 })
    assert(await evaluate('document.documentElement.scrollWidth <= innerWidth'))
  }
  await assertPrivateStorage(evaluate)
  // Router navigation unmounts previews without replacing the document/test counters.
  await evaluate(`document.querySelector('.back-link').click()`)
  await until(() => evaluate('window.revokedUrls.length === window.previewUrls.length'), 'all preview URLs revoked on unmount')
  tickets[0].attachments = original
  await navigate('/tickets/142'); await waitText('original.txt')
  console.log('PASS: lazy authorized image/WebM/MP4 cards, real MP4/WebM metadata, keyboard player, responsive layout, no durable bytes and URL cleanup')
}
