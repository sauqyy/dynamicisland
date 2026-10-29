import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { BACKEND_READY, supabase } from './supabase'
import type { Friend } from './useSocial'
import { openMic, trackOutput } from './audioDevices'
import { playJoin, playLeave } from './callSounds'

export type CallPhase = 'idle' | 'calling' | 'incoming' | 'connecting' | 'active'

export interface CallState {
  phase: CallPhase
  /** the friend on the other end */
  peer: string | null
  muted: boolean
  /** you can't hear them (and, like Discord, they can't hear you either) */
  deafened: boolean
  /** when audio started flowing, for the call timer */
  since: number | null
  /** why the last call ended badly; clears by itself */
  error: string | null
}

const IDLE: CallState = { phase: 'idle', peer: null, muted: false, deafened: false, since: null, error: null }
const RING_MS = 30_000
const ERROR_MS = 4_000

const TURN_URL = import.meta.env.VITE_TURN_URL as string | undefined
// STUN only gets most connections through; set VITE_TURN_* (see supabase/README.md) for the strict-NAT rest
export const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
    ...(TURN_URL
      ? [{ urls: TURN_URL, username: import.meta.env.VITE_TURN_USER as string, credential: import.meta.env.VITE_TURN_PASS as string }]
      : []),
  ],
}

interface Signal {
  from: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

/**
 * 1:1 voice calls. WebRTC carries the audio peer to peer; Supabase Realtime broadcast on
 * each user's own `call-<id>` channel carries the signalling (invite, offer, answer, ice).
 */
export function useCall(me: string | null, friends: Friend[], onIncoming?: (from: Friend) => void) {
  const [state, setState] = useState<CallState>(IDLE)
  const stateRef = useRef(state)
  const friendsRef = useRef(friends)
  friendsRef.current = friends
  const incomingCb = useRef(onIncoming)
  incomingCb.current = onIncoming

  const pc = useRef<RTCPeerConnection | null>(null)
  const mic = useRef<MediaStream | null>(null)
  const audio = useRef<HTMLAudioElement | null>(null)
  const pendingIce = useRef<RTCIceCandidateInit[]>([])
  const ringTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const outbound = useRef(new Map<string, Promise<RealtimeChannel>>())

  const set = useCallback((s: CallState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const send = useCallback(
    async (to: string, event: string, payload: object = {}) => {
      if (!me) return
      let ch = outbound.current.get(to)
      if (!ch) {
        ch = new Promise<RealtimeChannel>((resolve) => {
          const c = supabase.channel(`call-${to}`, { config: { broadcast: { self: false } } })
          c.subscribe(() => resolve(c))
        })
        outbound.current.set(to, ch)
      }
      await (await ch).send({ type: 'broadcast', event, payload: { from: me, ...payload } })
    },
    [me],
  )

  /** Tears the call down locally. `error` is shown for a few seconds. */
  const finish = useCallback(
    (error: string | null = null) => {
      clearTimeout(ringTimer.current)
      clearTimeout(errorTimer.current)
      if (stateRef.current.phase === 'active') playLeave()
      const conn = pc.current
      pc.current = null
      if (conn) {
        conn.onicecandidate = conn.ontrack = conn.onconnectionstatechange = null
        conn.close()
      }
      mic.current?.getTracks().forEach((t) => t.stop())
      mic.current = null
      if (audio.current) audio.current.srcObject = null
      pendingIce.current = []
      set({ ...IDLE, peer: error ? stateRef.current.peer : null, error })
      if (error) errorTimer.current = setTimeout(() => set(IDLE), ERROR_MS)
    },
    [set],
  )

  /** Ends the call and tells the other side. */
  const end = useCallback(
    (error: string | null = null) => {
      const peer = stateRef.current.peer
      if (peer) send(peer, 'hangup').catch(() => {})
      finish(error)
    },
    [send, finish],
  )

  const getMic = useCallback(async () => {
    try {
      mic.current = await openMic()
      return true
    } catch {
      return false
    }
  }, [])

  const makePeer = useCallback(
    (peer: string) => {
      const conn = new RTCPeerConnection(ICE)
      pc.current = conn
      conn.onicecandidate = (e) => {
        if (e.candidate) send(peer, 'ice', { candidate: e.candidate.toJSON() }).catch(() => {})
      }
      conn.ontrack = (e) => {
        if (!audio.current) {
          audio.current = new Audio()
          trackOutput(audio.current)
        }
        audio.current.srcObject = e.streams[0]
        audio.current.muted = stateRef.current.deafened
        audio.current.play().catch(() => {})
      }
      conn.onconnectionstatechange = () => {
        if (pc.current !== conn) return
        if (conn.connectionState === 'connected') {
          if (stateRef.current.phase !== 'active') playJoin()
          set({ ...stateRef.current, phase: 'active', since: Date.now() })
        }
        else if (conn.connectionState === 'failed') end("Couldn't connect")
      }
      mic.current?.getTracks().forEach((t) => conn.addTrack(t, mic.current!))
      return conn
    },
    [send, set, end],
  )

  const drainIce = useCallback(async (conn: RTCPeerConnection) => {
    const queued = pendingIce.current
    pendingIce.current = []
    for (const c of queued) await conn.addIceCandidate(c).catch(() => {})
  }, [])

  const handle = useRef<(event: string, p: Signal) => void>(() => {})
  handle.current = (event, p) => {
    const s = stateRef.current
    if (!friendsRef.current.some((f) => f.profile.id === p.from)) return

    if (event === 'invite') {
      if (s.phase !== 'idle') {
        send(p.from, 'busy').catch(() => {})
        return
      }
      clearTimeout(errorTimer.current)
      set({ ...IDLE, phase: 'incoming', peer: p.from })
      ringTimer.current = setTimeout(() => finish('Missed call'), RING_MS)
      const f = friendsRef.current.find((x) => x.profile.id === p.from)
      if (f) incomingCb.current?.(f)
      return
    }
    if (p.from !== s.peer) return

    switch (event) {
      case 'accept': {
        if (s.phase !== 'calling') return
        clearTimeout(ringTimer.current)
        set({ ...s, phase: 'connecting' })
        const conn = makePeer(p.from)
        conn
          .createOffer()
          .then(async (offer) => {
            await conn.setLocalDescription(offer)
            await send(p.from, 'offer', { sdp: offer })
          })
          .catch(() => end("Couldn't connect"))
        return
      }
      case 'offer': {
        const conn = pc.current
        if (!conn || !p.sdp) return
        conn
          .setRemoteDescription(p.sdp)
          .then(async () => {
            await drainIce(conn)
            const answer = await conn.createAnswer()
            await conn.setLocalDescription(answer)
            await send(p.from, 'answer', { sdp: answer })
          })
          .catch(() => end("Couldn't connect"))
        return
      }
      case 'answer': {
        const conn = pc.current
        if (!conn || !p.sdp) return
        conn
          .setRemoteDescription(p.sdp)
          .then(() => drainIce(conn))
          .catch(() => end("Couldn't connect"))
        return
      }
      case 'ice': {
        if (!p.candidate) return
        if (pc.current?.remoteDescription) pc.current.addIceCandidate(p.candidate).catch(() => {})
        else pendingIce.current.push(p.candidate)
        return
      }
      case 'decline':
        finish('Call declined')
        return
      case 'busy':
        finish('Busy on another call')
        return
      case 'hangup':
        finish(s.phase === 'incoming' ? 'Missed call' : null)
    }
  }

  useEffect(() => {
    if (!me || !BACKEND_READY) return
    const outs = outbound.current
    const inbox = supabase
      .channel(`call-${me}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: '*' }, ({ event, payload }) => handle.current(event, payload as Signal))
      .subscribe()
    return () => {
      finish()
      supabase.removeChannel(inbox)
      outs.forEach((p) => p.then((c) => supabase.removeChannel(c)))
      outs.clear()
    }
  }, [me, finish])

  const start = useCallback(
    async (peer: string) => {
      if (stateRef.current.phase !== 'idle') return
      clearTimeout(errorTimer.current)
      set({ ...IDLE, phase: 'calling', peer })
      if (!(await getMic())) {
        finish('Microphone unavailable')
        return
      }
      send(peer, 'invite').catch(() => end("Couldn't reach them"))
      ringTimer.current = setTimeout(() => end('No answer'), RING_MS)
    },
    [set, getMic, send, finish, end],
  )

  const accept = useCallback(async () => {
    const s = stateRef.current
    if (s.phase !== 'incoming' || !s.peer) return
    clearTimeout(ringTimer.current)
    set({ ...s, phase: 'connecting' })
    if (!(await getMic())) {
      send(s.peer, 'decline').catch(() => {})
      finish('Microphone unavailable')
      return
    }
    makePeer(s.peer)
    send(s.peer, 'accept').catch(() => end("Couldn't connect"))
  }, [set, getMic, makePeer, send, finish, end])

  const decline = useCallback(() => {
    const s = stateRef.current
    if (s.phase !== 'incoming' || !s.peer) return
    send(s.peer, 'decline').catch(() => {})
    finish()
  }, [send, finish])

  const applyAudio = (muted: boolean, deafened: boolean) => {
    // deafening also silences your microphone; undeafening gives it back unless you muted it yourself
    mic.current?.getAudioTracks().forEach((t) => (t.enabled = !muted && !deafened))
    if (audio.current) audio.current.muted = deafened
  }

  const toggleMute = useCallback(() => {
    const { muted, deafened } = stateRef.current
    // muting while deafened is not possible; unmuting while deafened also lifts the deafen
    const next = !muted
    applyAudio(next, next ? deafened : false)
    set({ ...stateRef.current, muted: next, deafened: next ? deafened : false })
  }, [set])

  // deafening mutes you too, and undeafening unmutes you
  const toggleDeafen = useCallback(() => {
    const next = !stateRef.current.deafened
    applyAudio(next, next)
    set({ ...stateRef.current, muted: next, deafened: next })
  }, [set])

  const hangUp = useCallback(() => end(), [end])

  /** your live microphone, for the level meter */
  const micStream = useCallback(() => mic.current, [])

  return { state, start, accept, decline, hangUp, toggleMute, toggleDeafen, micStream }
}

export type Call = ReturnType<typeof useCall>
