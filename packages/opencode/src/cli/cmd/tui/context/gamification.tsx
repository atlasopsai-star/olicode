import { createContext, createEffect, createSignal, onMount, useContext, type JSX } from "solid-js"
import fs from "fs"
import path from "path"
import os from "os"

const DATA_PATH = path.join(os.homedir(), ".olicode", "gamification.json")

const XP_PER_LEVEL = 1000
const QUESTS = [
  { id: "messages_10", label: "Send 10 messages", target: 10, metric: "messages" },
  { id: "files_5", label: "Edit 5 files", target: 5, metric: "filesEdited" },
  { id: "sessions_5", label: "Start 5 sessions", target: 5, metric: "sessions" },
  { id: "streak_3", label: "3-day streak", target: 3, metric: "streak" },
  { id: "messages_50", label: "Send 50 messages", target: 50, metric: "messages" },
  { id: "files_20", label: "Edit 20 files", target: 20, metric: "filesEdited" },
  { id: "sessions_10", label: "Start 10 sessions", target: 10, metric: "sessions" },
  { id: "streak_7", label: "7-day streak", target: 7, metric: "streak" },
]

type GamificationData = {
  xp: number
  messages: number
  filesEdited: number
  sessions: number
  streak: number
  lastSessionDate: string
  completedQuests: string[]
}

const defaults: GamificationData = {
  xp: 0,
  messages: 0,
  filesEdited: 0,
  sessions: 0,
  streak: 0,
  lastSessionDate: "",
  completedQuests: [],
}

function load(): GamificationData {
  try {
    const raw = fs.readFileSync(DATA_PATH, "utf8")
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    return { ...defaults }
  }
}

function save(data: GamificationData) {
  try {
    fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true })
    fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
  } catch {
    // ignore write errors
  }
}

function level(xp: number) {
  return Math.floor(xp / XP_PER_LEVEL) + 1
}

function xpIntoLevel(xp: number) {
  return xp % XP_PER_LEVEL
}

function completedQuestCount(data: GamificationData) {
  return QUESTS.filter((q) => {
    if (data.completedQuests.includes(q.id)) return true
    const val = data[q.metric as keyof GamificationData] as number
    return val >= q.target
  }).length
}

type GamificationContext = {
  data: () => GamificationData
  level: () => number
  xpIntoLevel: () => number
  xpNeeded: () => number
  completedQuests: () => number
  totalQuests: () => number
  addXP: (amount: number) => void
  trackMessage: () => void
  trackFileEdit: () => void
  trackSession: () => void
}

const Ctx = createContext<GamificationContext>()

export function GamificationProvider(props: { children: JSX.Element }) {
  const [data, setData] = createSignal<GamificationData>(defaults)

  onMount(() => {
    const loaded = load()
    // Check and update streak
    const today = new Date().toISOString().split("T")[0]!
    const last = loaded.lastSessionDate
    if (last !== today) {
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yStr = yesterday.toISOString().split("T")[0]!
      const newStreak = last === yStr ? loaded.streak + 1 : 1
      const updated = {
        ...loaded,
        sessions: loaded.sessions + 1,
        xp: loaded.xp + 5,
        streak: newStreak,
        lastSessionDate: today,
      }
      save(updated)
      setData(updated)
    } else {
      setData(loaded)
    }
  })

  const addXP = (amount: number) => {
    setData((d) => {
      const updated = { ...d, xp: d.xp + amount }
      save(updated)
      return updated
    })
  }

  const trackMessage = () => {
    setData((d) => {
      const updated = { ...d, messages: d.messages + 1, xp: d.xp + 10 }
      save(updated)
      return updated
    })
  }

  const trackFileEdit = () => {
    setData((d) => {
      const updated = { ...d, filesEdited: d.filesEdited + 1, xp: d.xp + 25 }
      save(updated)
      return updated
    })
  }

  const trackSession = () => {
    setData((d) => {
      const updated = { ...d, sessions: d.sessions + 1 }
      save(updated)
      return updated
    })
  }

  const ctx: GamificationContext = {
    data,
    level: () => level(data().xp),
    xpIntoLevel: () => xpIntoLevel(data().xp),
    xpNeeded: () => XP_PER_LEVEL,
    completedQuests: () => completedQuestCount(data()),
    totalQuests: () => QUESTS.length,
    addXP,
    trackMessage,
    trackFileEdit,
    trackSession,
  }

  return <Ctx.Provider value={ctx}>{props.children}</Ctx.Provider>
}

export function useGamification() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error("useGamification must be inside GamificationProvider")
  return ctx
}
