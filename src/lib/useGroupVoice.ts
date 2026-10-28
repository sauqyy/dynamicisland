import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { BACKEND_READY, supabase } from './supabase'
import { openMic, trackOutput } from './audioDevices'
import { ICE } from './useCall'
import type { Group } from './useGroups'

/** The most people allowed in one group's voice chat. */
export const MAX_VOICE = 6

export interface VoiceState {
  /** the group whose voice chat you are in (or joining) */
  groupId: string | null
  joining: boolean
  /** user ids in the room, in join order */
  members: string[]
  muted: boolean
  /** you can't hear anyone (and your microphone is off too) */
  deafened: boolean
  /** when you got in, for the call timer */
  since: number | null
  /** why the last join failed or ended; clears by itself */
  error: string | null
}

const IDLE: VoiceState = { groupId: null, joining: false, members: [], muted: false, deafened: false, since: null, error: null }
const ERROR_MS = 4_000
const FULL = `Voice chat is full (max ${MAX_VOICE})`

interface Peer {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  pending: RTCIceCandidateInit[]
}

interface Session {
  gid: string
  channel: RealtimeChannel
  mic: MediaStream
  peers: Map<string, Peer>
  /** our presence is published; before that we only look at who is already in */
  tracked: boolean
}

interface VSignal {
  from: string
  to: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

function closePeer(p: Peer) {
  p.pc.onicecandidate = p.pc.ontrack = p.pc.onconnectionstatechange = null
  p.pc.close()
  p.audio.srcObject = null
}

/**
 * Group voice chat, up to MAX_VOICE people per group. Everyone connects to everyone (a mesh of
 * WebRTC peers). Supabase Realtime presence on `voice-<group id>` says who is in the room and
 * broadcast on the same channel carries the signalling.
 *
 * The cap is enforced by the apps themselves: the first MAX_VOICE people by join time stay,
 * anyone later leaves on their own.
 */
export function useGroupVoice(me: string | null, groups: Group[]) {
  const [state, setState] = useState<VoiceState>(IDLE)
  const stateRef = useRef(state)
  const groupsRef = useRef(groups)
  groupsRef.current = groups
  const sess = useRef<Session | null>(null)
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const set = useCallback((s: VoiceState) => {
    stateRef.current = s
    setState(s)
  }, [])

  const leave = useCallback(
    (error: string | null = null) => {
      clearTimeout(errorTimer.current)
      const s = sess.current
      sess.current = null
      if (s) {
        s.peers.forEach(closePeer)
        s.peers.clear()
        s.mic.getTracks().forEach((t) => t.stop())
        supabase.removeChannel(s.channel)
      }
      set({ ...IDLE, groupId: error ? stateRef.current.groupId : null, error })
      if (error) errorTimer.current = setTimeout(() => set(IDLE), ERROR_MS)
    },
    [set],
  )

  useEffect(() => () => leave(), [me, leave])

  const join = useCallback(
    async (gid: string) => {
      if (!me || !BACKEND_READY || sess.current || stateRef.current.joining) return
      clearTimeout(errorTimer.current)
      set({ ...IDLE, groupId: gid, joining: true })
      let mic: MediaStream
      try {
        mic = await openMic()
      } catch {
        leave('Microphone unavailable')
        return
      }
      if (stateRef.current.groupId !== gid || !stateRef.current.joining) {
        // cancelled while the permission prompt was open
        mic.getTracks().forEach((t) => t.stop())
        return
      }

      const channel = supabase.channel(`voice-${gid}`, { config: { broadcast: { self: false }, presence: { key: me } } })
      const s: Session = { gid, channel, mic, peers: new Map(), tracked: false }
      sess.current = s

      const isMember = (id: string) => groupsRef.current.find((g) => g.id === gid)?.members.some((m) => m.id === id) ?? false
      const signal = (event: string, to: string, payload: object) =>
        channel.send({ type: 'broadcast', event, payload: { from: me, to, ...payload } }).catch(() => {})

      const ensurePeer = (id: string): Peer | null => {
        const known = s.peers.get(id)
        if (known) return known
        if (s.peers.size >= MAX_VOICE - 1) return null
        const pc = new RTCPeerConnection(ICE)
        const peer: Peer = { pc, audio: new Audio(), pending: [] }
        trackOutput(peer.audio)
        s.peers.set(id, peer)
        pc.onicecandidate = (e) => {
          if (e.candidate) signal('ice', id, { candidate: e.candidate.toJSON() })
        }
        pc.ontrack = (e) => {
          peer.audio.srcObject = e.streams[0]
          peer.audio.muted = stateRef.current.deafened
          peer.audio.play().catch(() => {})
        }
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' && s.peers.get(id) === peer) {
            closePeer(peer)
            s.peers.delete(id)
          }
        }
        mic.getTracks().forEach((t) => pc.addTrack(t, mic))
        return peer
      }

      const drain = async (peer: Peer) => {
        const queued = peer.pending
        peer.pending = []
        for (const c of queued) await peer.pc.addIceCandidate(c).catch(() => {})
      }

      const offerTo = async (id: string) => {
        const peer = ensurePeer(id)
        if (!peer) return
        const offer = await peer.pc.createOffer()
        await peer.pc.setLocalDescription(offer)
        signal('offer', id, { sdp: offer })
      }

      channel
        .on('presence', { event: 'sync' }, () => {
          if (sess.current !== s) return
          const present = Object.entries(channel.presenceState<{ joinedAt: number }>())
            .map(([id, metas]) => ({ id, at: metas[0]?.joinedAt ?? 0 }))
            .sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1))
          if (!s.tracked) {
            if (present.length >= MAX_VOICE) {
              leave(FULL)
              return
            }
            s.tracked = true
            channel.track({ joinedAt: Date.now() })
            return
          }
          const order = present.map((p) => p.id)
          // two people can slip in at once; whoever ended up past the cap steps back out
          if (order.indexOf(me) >= MAX_VOICE) {
            leave(FULL)
            return
          }
          const room = order.slice(0, MAX_VOICE)
          const others = room.filter((id) => id !== me && isMember(id))
          s.peers.forEach((p, id) => {
            if (!others.includes(id)) {
              closePeer(p)
              s.peers.delete(id)
            }
          })
          // the lower id makes the offer, so two people never both offer
          for (const id of others) if (!s.peers.has(id) && me < id) offerTo(id).catch(() => {})
          set({ ...stateRef.current, joining: false, members: room, since: stateRef.current.since ?? Date.now() })
        })
        .on('broadcast', { event: '*' }, ({ event, payload }) => {
          const p = payload as VSignal
          if (sess.current !== s || p.to !== me || !isMember(p.from)) return
          const peer = ensurePeer(p.from)
          if (!peer) return
          if (event === 'offer' && p.sdp) {
            peer.pc
              .setRemoteDescription(p.sdp)
              .then(async () => {
                await drain(peer)
                const answer = await peer.pc.createAnswer()
                await peer.pc.setLocalDescription(answer)
                signal('answer', p.from, { sdp: answer })
              })
              .catch(() => {})
          } else if (event === 'answer' && p.sdp) {
            peer.pc
              .setRemoteDescription(p.sdp)
              .then(() => drain(peer))
              .catch(() => {})
          } else if (event === 'ice' && p.candidate) {
            if (peer.pc.remoteDescription) peer.pc.addIceCandidate(p.candidate).catch(() => {})
            else peer.pending.push(p.candidate)
          }
        })
        .subscribe((status) => {
          if (sess.current !== s) return
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') leave("Couldn't connect")
        })
    },
    [me, set, leave],
  )

  const applyAudio = (muted: boolean, deafened: boolean) => {
    const s = sess.current
    if (!s) return
    // deafening also silences your microphone; undeafening gives it back unless you muted it yourself
    s.mic.getAudioTracks().forEach((t) => (t.enabled = !muted && !deafened))
    s.peers.forEach((p) => (p.audio.muted = deafened))
  }

  const toggleMute = useCallback(() => {
    const { muted, deafened } = stateRef.current
    // unmuting while deafened also lifts the deafen
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

  const hangUp = useCallback(() => leave(), [leave])

  /** your live microphone, for the level meter */
  const micStream = useCallback(() => sess.current?.mic ?? null, [])

  return { state, join, leave: hangUp, toggleMute, toggleDeafen, micStream }
}

export type GroupVoice = ReturnType<typeof useGroupVoice>
