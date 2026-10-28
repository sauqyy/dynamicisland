import { CAMPUS } from './campus'

export interface Release {
  version: string
  title: string
  items: string[]
  /** only for the Universitas Indonesia build */
  campus?: boolean
}

/** Newest first. Add an entry here when you bump the version; it shows once in the island after the update installs. */
export const CHANGELOG: Release[] = [
  {
    version: '0.7.7',
    campus: true,
    title: 'Classes, rebuilt around your next class',
    items: [
      'Connect SLCM in Classes to get every class\'s official time and room from your study plan. You sign in on SLCM\'s own page, and only the schedule comes back.',
      'Each class shows the topic exactly as the lesson plan words it, a link to that page of the document, and the SCELE section and slides for that topic. If nothing matches, Classes says so instead of showing unrelated slides.',
      'Today and Tomorrow are one list. Your next class opens first, and you can tap any other class to see what it covers.',
      'Questions that need you, like a missing class time or a course you\'re enrolled in twice, come first, and the sources sit folded at the bottom.',
    ],
  },
  {
    version: '0.7.6',
    title: 'Prompter, deadlines and your week',
    items: [
      'Prompter (Tools): paste a script and read it as it scrolls at your pace, with speed, text size, mirror and fullscreen.',
      'Deadlines (Plan): add things with a date and time. In Settings, choose Deadline for what the pill shows, then hover the pill to see them all.',
      'Schedule (Plan): plan Monday to Sunday, and open fullscreen to see the whole week at once.',
    ],
  },
  {
    version: '0.7.5',
    title: 'Campus has its own build',
    items: [
      'The Campus tools for Fasilkom UI students (Verify Student, Due, Classes and Inbox) now come in their own build, Dynamic Island UI, so this version is the same for everyone.',
    ],
  },
  {
    version: '0.7.4',
    campus: true,
    title: 'Classes from your course timelines',
    items: [
      'Classes now reads each course\'s timeline, from PDFs, slides, Word, Excel or a linked Google Sheet, and finds your class days from it.',
      'Today and Tomorrow list your classes with their time, room and what each one covers, plus the matching course materials.',
      'Holidays on the timeline skip the reminder, and you get a heads-up on days when a class has no time listed.',
      'If a course\'s timeline needs a Google sign-in, Classes tells you which one so you can open it.',
    ],
  },
  {
    version: '0.7.3',
    campus: true,
    title: 'Your classes, from the syllabus',
    items: [
      'Classes now reads your class days from each course\'s syllabus when the course page doesn\'t list them.',
      'Only this term\'s courses are used, so old courses SCELE still shows are left out.',
      'Courses you TA are marked TA. Tap TA or Hide on any course in Classes to change it.',
    ],
  },
  {
    version: '0.7.2',
    campus: true,
    title: 'Verify Student for assistants',
    items: ['Fasilkom UI students whom SSO UI also lists as staff, such as teaching assistants, can now verify and use Campus.'],
  },
  {
    version: '0.7.1',
    campus: true,
    title: 'Verify Student fixed',
    items: [
      'Verify Student now works for Fasilkom UI students even when SSO UI leaves out which faculty you are in.',
      'If it does, the Profile card asks you to confirm with your SCELE sign-in, which also connects SCELE.',
    ],
  },
  {
    version: '0.7.0',
    campus: true,
    title: 'Campus for Fasilkom UI',
    items: [
      'Fasilkom UI students: tap Verify Student on the Profile page and sign in with SSO UI to unlock Campus.',
      'Due lists your SCELE deadlines, and the island warns you 24 hours, 3 hours and 1 hour before each one.',
      'Classes builds your weekly schedule from your SCELE courses and reminds you before class, with that week\'s topic.',
      'Inbox collects SCELE announcements and new course materials, and the pill shows how much is due today.',
    ],
  },
  {
    version: '0.6.3',
    title: 'Better group chats',
    items: [
      'Group messages show who sent them, and who has read them. Run the updated groups.sql in Supabase to turn on read receipts.',
      'Press Shift+Enter for a new line in chats.',
      'Hover the pill during a group call to see who is in the voice chat.',
      'Choose your microphone and speaker in Settings, under Calls.',
      'Deafening also mutes you, and undeafening unmutes you.',
      'Read messages stay read after you sign out and back in.',
      'Fixed lyrics sometimes saying none were available, and the chat header scrolling away.',
    ],
  },
  {
    version: '0.6.2',
    title: 'Easier to read lyrics',
    items: [
      'Lyrics in Playing are bigger, wrap instead of cutting off, and fade with distance from the current line. Click a line to jump to it.',
      'Previous, play and next now sit on one row with the timeline and both times.',
      'Pick how the equalizer looks (Bars, Wave or Pulse) and its colour (Album, Accent or your own) in Settings, under Pill.',
    ],
  },
  {
    version: '0.6.1',
    title: 'A new look',
    items: [
      'The pages now sit in one bar at the bottom of the card. Tap a group to open it, then pick a page.',
      'Want the card to grow and shrink with each page? Pick Fits the page in Settings, under Size.',
      'While music plays, the pill shows the cover, the current lyric and the equalizer.',
      'A new song shows a Now playing alert with its cover. Click it to open Playing.',
      'Charging, battery and downloads show their progress along the bottom edge of the island.',
      'Playing, Weather and Timer are redesigned, Settings is grouped into sections, and the icons are cleaner.',
    ],
  },
  {
    version: '0.5.0',
    title: 'Group voice chat',
    items: [
      'Join a group voice chat from the group chat (up to 6 people per group).',
      'Hover the island while a call rings to see who is calling, with Answer and Decline.',
      'During a call the island becomes a pill with the timer, mute, deafen and end call.',
    ],
  },
  {
    version: '0.4.2',
    title: 'Groups and calls',
    items: [
      'Pick an icon and colour for a group, and rename it from Info.',
      'Groups have fullscreen chat, with your groups listed under your friends.',
      'Deafen button in calls, new mute and hang-up icons, and the island glows while someone is calling.',
      'The page arrows are gone to give pages more room.',
    ],
  },
  {
    version: '0.4.1',
    title: 'Call button',
    items: ['The call button next to Send is now a phone handset.'],
  },
  {
    version: '0.4.0',
    title: 'Group chats, voice calls',
    items: [
      'Create group chats with your friends from the new Groups page.',
      'Call a friend with the button next to Send in their chat. Audio goes straight between your apps.',
      'Sound volume slider and a keyboard sounds switch in Settings.',
      'Opening the app a second time no longer starts a second island.',
    ],
  },
  {
    version: '0.3.12',
    title: 'Sound effects',
    items: [
      'The island now makes small sounds as you use it: a tap when it opens, a soft close when it shuts, and a cue for each alert.',
      'Pick a sound pack in Settings (Mech, Basic, Bubble or Press), or mute it.',
    ],
  },
  {
    version: '0.3.11',
    title: 'Offline status, brightness',
    items: [
      'Friends now show as offline once your app has been closed for a few minutes, instead of staying Available.',
      'Changing the screen brightness shows an alert in the island.',
      'Chats group messages by day (Today, Yesterday, weekday or date).',
    ],
  },
  {
    version: '0.3.10',
    title: 'Smoother fullscreen',
    items: ['Fixed the island jumping for a moment when entering or leaving fullscreen chat.'],
  },
  {
    version: '0.3.9',
    title: 'Fullscreen chat',
    items: [
      'Chats have a fullscreen button: the island grows to fill the screen and shrinks back smoothly.',
      'In fullscreen your contacts sit on the left, so you can switch chats without leaving.',
      'Esc leaves fullscreen.',
    ],
  },
]

const SEEN_KEY = 'di.seenVersion'

/**
 * The release to announce for this launch, or null. A first install just records the version,
 * so the card only appears after an update, and only when the changelog has an entry for it.
 */
export function releaseToShow(current: string): Release | null {
  try {
    const seen = localStorage.getItem(SEEN_KEY)
    localStorage.setItem(SEEN_KEY, current)
    if (!seen || seen === current) return null
  } catch {
    return null
  }
  const r = CHANGELOG.find((x) => x.version === current)
  return r && (CAMPUS || !r.campus) ? r : null
}
