import { useRef, useState } from 'react'
import api from '@/services/api'
import { Mic } from 'lucide-react'

function encode(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function VoiceDictation({ onTranscript, disabled = false }: { onTranscript: (text: string) => void; disabled?: boolean }) {
  const [state, setState] = useState<'idle' | 'starting' | 'recording' | 'finishing'>('idle')
  const [error, setError] = useState('')
  const socket = useRef<WebSocket | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const context = useRef<AudioContext | null>(null)
  const source = useRef<MediaStreamAudioSourceNode | null>(null)
  const processor = useRef<ScriptProcessorNode | null>(null)
  const silentGain = useRef<GainNode | null>(null)
  const transcript = useRef('')
  const interimTranscript = useRef('')
  const stopRequested = useRef(false)
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cleanup = (insertTranscript = true) => {
    if (finishTimer.current) clearTimeout(finishTimer.current)
    processor.current?.disconnect(); silentGain.current?.disconnect(); source.current?.disconnect()
    stream.current?.getTracks().forEach((track) => track.stop())
    void context.current?.close(); socket.current?.close()
    processor.current = null; silentGain.current = null; source.current = null; stream.current = null; context.current = null; socket.current = null
    setState('idle')
    const completedTranscript =
      transcript.current.trim() || interimTranscript.current.trim()
    if (insertTranscript && completedTranscript) onTranscript(completedTranscript)
  }
  const stop = () => {
    if (socket.current?.readyState === WebSocket.OPEN && processor.current) {
      stopRequested.current = true
      processor.current.disconnect(); processor.current = null
      source.current?.disconnect(); source.current = null
      stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null
      void context.current?.close(); context.current = null
      socket.current.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }))
      setState('finishing')
      finishTimer.current = setTimeout(() => cleanup(), 8000)
      return
    }
    cleanup()
  }
  const start = async () => {
    setError(''); setState('starting'); transcript.current = ''; interimTranscript.current = ''
    stopRequested.current = false
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('MIC_UNAVAILABLE')
      const [{ data }, media] = await Promise.all([
        api.post<{ token: string; model: string }>('/ai/transcription/token'),
        navigator.mediaDevices.getUserMedia({ audio: true }),
      ])
      stream.current = media
      const ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained?access_token=${encodeURIComponent(data.token)}`)
      socket.current = ws
      ws.onopen = () => {
        ws.send(JSON.stringify({ setup: { model: `models/${data.model}`, generationConfig: { responseModalities: ['TEXT'] }, inputAudioTranscription: {} } }))
      }
      ws.onmessage = async (event) => {
        try {
          const raw = typeof event.data === 'string'
            ? event.data
            : event.data instanceof Blob
              ? await event.data.text()
              : new TextDecoder().decode(event.data)
          const message = JSON.parse(raw) as {
            setupComplete?: unknown
            serverContent?: {
              inputTranscription?: { text?: string }
              interimInputTranscription?: { text?: string }
            }
            error?: { code?: number; message?: string; status?: string }
          }
          if (message.error) {
            setError('Gemini rejected the voice session. Try again or type your description instead.')
            cleanup(false)
            return
          }
          // Interim transcription is cumulative. Append only finalized segments.
          const text = message.serverContent?.inputTranscription?.text
          if (text) {
            transcript.current += `${transcript.current ? ' ' : ''}${text.trim()}`
            interimTranscript.current = ''
            // Gemini 3.5 Transcribe Live does not send turnComplete. A finalized
            // input transcription is the completion signal for a stopped dictation.
            if (stopRequested.current) {
              cleanup()
              return
            }
          }
          if (message.serverContent?.interimInputTranscription?.text) {
            interimTranscript.current =
              message.serverContent.interimInputTranscription.text
          }
          if (message.setupComplete) {
            const audio = new AudioContext()
            context.current = audio
            const input = audio.createMediaStreamSource(media)
            const node = audio.createScriptProcessor(4096, 1, 1)
            const mute = audio.createGain()
            mute.gain.value = 0
            source.current = input; processor.current = node; silentGain.current = mute
            node.onaudioprocess = (event) => {
              if (ws.readyState !== WebSocket.OPEN) return
              const samples = event.inputBuffer.getChannelData(0)
              const ratio = audio.sampleRate / 16000
              const count = Math.floor(samples.length / ratio)
              const pcm = new Int16Array(count)
              for (let i = 0; i < count; i++) {
                const sample = samples[Math.floor(i * ratio)]
                pcm[i] = Math.max(-1, Math.min(1, sample)) * 0x7fff
              }
              ws.send(JSON.stringify({ realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: encode(new Uint8Array(pcm.buffer)) }] } }))
            }
            input.connect(node); node.connect(mute); mute.connect(audio.destination)
            await audio.resume()
            setState('recording')
          }
        } catch {
          setError('Could not process the voice response. Try again or type your description instead.')
          cleanup(false)
        }
      }
      ws.onerror = () => {
        setError('Voice connection failed. You can type your description instead.')
        cleanup(false)
      }
      ws.onclose = () => {
        // Avoid relying on the state captured when start() created this socket.
        // That closure still sees "idle" even after React has rendered recording.
        if (socket.current === ws) cleanup()
      }
    } catch (failure) {
      const status = (failure as { response?: { status?: number } })?.response?.status
      setError(status === 503 || status === 500
        ? 'Voice dictation could not connect to Gemini. Check the server log and confirm the API key can create Live API tokens for Gemini 3.5 Transcribe Live.'
        : failure instanceof Error && failure.message === 'MIC_UNAVAILABLE'
          ? 'This browser does not support microphone capture. Try a current version of Chrome or Edge.'
          : failure instanceof DOMException && failure.name === 'NotAllowedError'
            ? 'Microphone access was denied. Allow microphone access for localhost in your browser settings.'
            : 'Could not start voice dictation. Check microphone permission and try again.')
      cleanup(false)
    }
  }
  return <div className="voice-dictation">
    <button type="button" className="button secondary" disabled={disabled || state === 'starting' || state === 'finishing'} onClick={() => state === 'recording' ? stop() : void start()}>
      {state === 'starting' ? 'Connecting…' : state === 'finishing' ? 'Finishing transcript…' : state === 'recording' ? 'Stop listening' : <><Mic size={16} aria-hidden="true" /> Describe by voice</>}
    </button>
    {state === 'recording' && <span role="status">Listening. Stop to insert the transcript.</span>}
    {state === 'finishing' && <span role="status">Finishing transcript…</span>}
    {error && <p role="alert" className="field-error">{error}</p>}
  </div>
}
