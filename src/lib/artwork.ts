interface Song {
  trackName: string
  artistName: string
  collectionName: string
  artworkUrl100?: string
}

function normalize(text: string) {
  return text.normalize('NFKC').trim().toLowerCase()
}

/** Look up missing covers without substituting a different song or artist. */
export async function fetchArtwork(
  track: { title: string; artist: string; album: string },
  signal: AbortSignal,
): Promise<string | null> {
  if (!track.title || !track.artist) return null
  const params = new URLSearchParams({
    term: `${track.artist} ${track.title}`,
    entity: 'song',
    limit: '50',
  })

  try {
    const response = await fetch(`https://itunes.apple.com/search?${params}`, { signal })
    if (!response.ok) return null
    const { results } = (await response.json()) as { results: Song[] }
    const matches = results.filter((song) =>
      normalize(song.trackName) === normalize(track.title)
      && normalize(song.artistName) === normalize(track.artist)
      && song.artworkUrl100,
    )
    const song = matches.find((song) => normalize(song.collectionName) === normalize(track.album)) ?? matches[0]
    return song?.artworkUrl100?.replace('/100x100bb.', '/600x600bb.') ?? null
  } catch {
    return null // Offline, rate limited or cancelled: keep the placeholder.
  }
}
