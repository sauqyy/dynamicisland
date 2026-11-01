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
    version: '0.7.17',
    campus: true,
    title: 'Weather you can trust',
    items: [
      'The weather is the middle of seven forecasts, including BMKG for your own kelurahan, so one model can no longer call rain on a dry afternoon. When they disagree it says "possible" and how many agree.',
      'The weather page names your kelurahan (like Rempoa), not just the kecamatan.',
      'Weather alerts are now your choice: Lumi asks on the Weather page, and you can change it there any time. They stay off until you say yes.',
      'Use my location no longer leaves the Weather page blank.',
      'Escape leaves a chat first, then closes the island.',
      'The island stays on screen when you open it near the left or right edge.',
      'Each page shows how many new things it has (Friends 2, Groups 5, Inbox 3), and the group icon adds them up.',
      'Looking at the Inbox for a second marks its SCELE notifications as read.',
    ],
  },
  {
    version: '0.7.16',
    campus: true,
    title: 'Rain you can read, and a safer island',
    items: [
      'The rain chart has a clock now: Now on the left, the hours along the bottom, a bar per quarter-hour on a light, moderate and heavy scale, and a bracket over the rain the sentence is about. Point at a bar to read it.',
      "Lumi tells you when to head out: go now while it's dry, wait for the rain to pass, or take the umbrella. The window she means is shaded on the chart.",
      "The weather tells one story: the sentence, Lumi, the chart and the hour strip now read the same forecast, so it won't say it's raining on a dry afternoon or show rain for hours after it stops.",
      'Updates are signed and checked before they install.',
      "Files and programs you didn't drop on the island ask before they open, passwords copied from a password manager stay out of the clipboard shelf, and your campus details on this computer are encrypted.",
      'Disconnecting SCELE opens its Security keys page, so you can switch the connection off there too.',
    ],
  },
  {
    version: '0.7.15',
    campus: true,
    title: 'Fixes you asked for',
    items: [
      "Use my location works in more places: if your device cannot say where you are, it tries several other ways, tells you when Windows has location switched off (with a button to open that setting), and can suggest your time zone's main city.",
      "The cover on Now Playing no longer shows the previous song's album when the next song starts.",
      'Chat stays on the latest message when you go fullscreen and back.',
      'What you were typing in a chat is kept when you go to another page and come back, for every friend and group.',
      'The Lumi page now sits beside Settings.',
    ],
  },
  {
    version: '0.7.14',
    campus: true,
    title: 'Make Lumi yours',
    items: [
      'A new Lumi page after Weather: pick a preset or choose her eyes, eye and body colour, size and glow, how lively she is, what she does with your cursor, and where she sits in the pill. She can also be turned off there.',
      'By default she now glances at your cursor and looks away, instead of watching it the whole time.',
      'To-do groups: drag a task onto another to group them, onto a group to move it, or out to take it back. Every move can be undone.',
      'Notes: keep as many as you like, each with its own label, folding open and shut.',
      'Weather finds where you are more precisely and always names the place, never just "My location".',
      "The tick in a to-do's circle is centred.",
      'Welcome backs are warmer and the card is only as tall as what it says, with no empty space under a short greeting.',
    ],
  },
  {
    version: '0.7.13',
    campus: true,
    title: 'Meet Lumi',
    items: [
      "Lumi is the island's new mascot. Her eyes and the time sit in the resting pill, and the first time she says hello and asks what to call you.",
      "Every reminder now has her face: classes, deadlines, submissions, grades and notices. Deadlines climb a lock-in ladder from three days down to the last hour.",
      "She cheers when you submit, finish an exam or clear your to-dos, checks on you (water, a stretch, a word when it's late), and moves about on her own.",
      "Calm mode in Settings takes out the explosions, shaking and flashes and quietens her sounds. Her sounds, her nudges and the time beside her can each be turned off.",
      "Weather you can act on: Lumi tells you when rain is on its way (\"Raining in about an hour\"), when it should stop, and about rainy days, storms, strong sun and heat. The Weather page can find where you are, and it follows you.",
      "The island redraws far less while music plays, so it runs smoother.",
    ],
  },
  {
    version: '0.7.12',
    campus: true,
    title: 'Today, and a welcome back',
    items: [
      'Connect Universitas Indonesia in one place: sign in with SSO UI, then type your password once for SCELE and your SLCM timetable. It isn\'t saved, and the SCELE sign-in now lives in your system\'s credential store.',
      'Today shows your next class, what\'s due, your to-dos and your schedule on one page. Due now lists your own deadlines with SCELE\'s.',
      'When you come back after a while, or switch the computer on, the island greets you with what needs you and what you missed.',
      'To-dos open into a description, a due date, links and files, and you tick one off by clicking its text. Dates can be typed ("fri 5pm", "besok jam 9").',
      'Profile lists what\'s kept on this computer, and Disconnect everything removes it all. Timers can have a goal.',
    ],
  },
  {
    version: '0.8.5',
    title: 'Astra in the pill',
    items: [
      "Astra's eyes can be the whole resting pill: turn on Only the eyes in Settings to hide the clock.",
      'The Astra page disappears from the rail while the assistant is off.',
      'Updating from the old Dynamic Island now removes the old copy, so you no longer end up with both.',
    ],
  },
  {
    version: '0.8.4',
    title: 'A new look for Setup',
    items: [
      "The installer has a new design: a larger window with square corners and Astra's eyes, which blink and look around while it works.",
      "The uninstaller and the installer's welcome page now carry the same look.",
    ],
  },
  {
    version: '0.8.2',
    title: 'Back in your Start menu',
    items: [
      'Astra Isle is findable from Windows Search and the Start menu again. Updating from an older version could drop its shortcut; the update now puts it back.',
    ],
  },
  {
    version: '0.8.1',
    title: 'Meet Astra',
    items: [
      'Meet Astra (beta), a little voice assistant. Say what you need and she opens apps, controls music and volume, starts timers, searches the web and answers questions. She is off until you choose to use her.',
      'Start a focus session from any deadline, and see your streak and week in Study.',
      'Astra and Home have new icons on the rail.',
    ],
  },
  {
    version: '0.7.11',
    campus: true,
    title: 'Know what\'s left to hand in',
    items: [
      'Due shows where each assignment stands: Not submitted, Draft, not submitted, Submitted or Graded. A draft isn\'t handed in until you press Submit on SCELE, so it stays marked.',
      'Once you hand something in, the island says well done, moves it to Submitted and stops reminding you about it.',
      'Reminders now come 3 days, 2 days, 24 hours, 12 hours, 6 hours, 3 hours and 1 hour before a deadline.',
      'Recent grades are on Due, hidden until you press Show. The alert for a new grade never shows the score.',
      'Syncing is lighter: a course page is only read again when SCELE says something on it changed, so new materials show up within about 10 minutes.',
      'Drag the island to the bottom of the screen and it sits on the taskbar, opening upwards. Double-click it to send it back to the top.',
    ],
  },
  {
    version: '0.7.10',
    campus: true,
    title: 'Every week shows what\'s next',
    items: [
      'Every week now shows each class\'s next topic and its room, instead of where its time came from. Hover a class to see the date, and whether its time came from SLCM or the course page.',
      'An exam or a week without class shows up there too.',
      'Topics are also found in a course\'s first week, like an "Intro to OS" deck in Week 00 that lists the term\'s topics, or a plan typed straight onto the course page.',
      'Syncing is faster, since several courses are read at once. Classes shows how far it has got.',
      'Classes catches up as soon as your computer wakes up or is back online, instead of showing what it had before. It still syncs every 10 minutes, day and night.',
      'If SLCM has no class for one of your courses, Classes asks whether you\'ve changed classes and offers to read SLCM again.',
    ],
  },
  {
    version: '0.7.9',
    title: 'Profiles and Apple Music lyrics',
    items: [
      "Click someone's picture in Friends, requests, chats and groups to open their profile, then click their photo to see it full size.",
      'New profile photos are saved sharper, so they look good when opened full size.',
      'Lyrics now show for songs playing in Apple Music on Windows.',
      'New group and Join a group are now clear buttons at the top of Groups.',
      'Settings shows which version you have installed, next to Version.',
    ],
  },
  {
    version: '0.7.8',
    campus: true,
    title: 'SLCM signs you in',
    items: [
      'Get times from SLCM now asks for your SSO UI password (the same one as SCELE) and signs in to SLCM for you, in the background. The password isn\'t saved.',
      'Classes shows how far it got. SLCM\'s site can be slow, and the island reloads it if it stops halfway.',
      'If SLCM needs you, for example after a wrong password, its window opens so you can finish there. You can also open it yourself, or stop.',
      'Topics are found week by week in lesson plans and RPS, in English or Indonesian: dated rows (26-Aug-2026 too, even with last year\'s year), "Week 07", "Minggu ke-3", "Pertemuan 5" or a numbered column.',
      'A lesson plan with one date per week gives that week\'s topic to every class that week, and weeks are counted from when the term really started.',
      'Section names like "Topic 15" are no longer shown as a topic. Classes shows what the section holds instead, or nothing.',
    ],
  },
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
