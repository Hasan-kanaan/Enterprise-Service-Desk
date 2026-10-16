# Private video test evidence

`browser-evidence.mp4` and `browser-evidence.webm` are tiny playable test files
generated from a 32 × 32 blue canvas using Chromium WebCodecs (AVC and VP8).
They contain no recorded people, customer data, downloaded assets or audio.
The browser test muxes the encoded frame into a minimal self-contained container.

The attachment HTTP and validation suites read these files to verify acceptance
of actual encoded media alongside synthetic malformed-container fixtures.
The requester browser suite separately generates and previews both formats,
checks media metadata, native controls, authorization failures and Blob cleanup.

To regenerate from the repository root in PowerShell:

```powershell
pnpm.cmd --dir client build
$env:UPDATE_VIDEO_FIXTURES = '1'
node client/test/employee-flow.mjs
Remove-Item Env:UPDATE_VIDEO_FIXTURES
```

Generation requires the browser capabilities used by the existing harness; no
FFmpeg, native transcoder or extra package is installed. Encoded output can vary
between browser versions. These files establish a small playable baseline, not
coverage of every codec, camera/container variant or browser.
