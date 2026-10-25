import { parseLrc } from './lyrics'

// Original placeholder lyrics, only used by the browser demo.
const DEMO_LRC = `
[00:02.00]Neon rain on the window glass
[00:07.00]Counting seconds as they pass
[00:12.00]Little island in the sky
[00:17.00]Rising up and floating by
[00:22.00]Pour it out, let it flow
[00:27.00]Watch the liquid come and go
[00:32.00]Stretch and shimmer, bend and glow
[00:37.00]Gravity won't let it show
[00:42.00]Hold the moment, hold it tight
[00:47.00]Melt it down into the night
[00:52.00]Every drop a little spark
[00:57.00]Shining softly in the dark
[01:02.00]Pour it out, let it flow
[01:07.00]Watch the liquid come and go
[01:12.00]Little island in the sky
[01:17.00]Never ask me why
`

export const DEMO = {
  id: 'demo',
  title: 'Liquid Skies',
  artist: 'Demo Artist',
  duration: 84,
  lyrics: parseLrc(DEMO_LRC),
}
