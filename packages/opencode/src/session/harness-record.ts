import { Effect } from "effect"
import { PartID, type MessageID, type SessionID } from "./schema"
import { Session } from "./session"
import type { MessageV2 } from "./message-v2"

export const write = Effect.fn("HarnessRecord.write")(function* (input: {
  session: Session.Interface
  sessionID: SessionID
  messageID: MessageID
  taskID: string
  kind: MessageV2.HarnessPart["kind"]
  data: Record<string, unknown>
}) {
  return yield* input.session.updatePart({
    id: PartID.ascending(),
    sessionID: input.sessionID,
    messageID: input.messageID,
    type: "harness",
    kind: input.kind,
    taskID: input.taskID,
    data: input.data,
    time: { created: Date.now() },
  })
})

export * as HarnessRecord from "./harness-record"
