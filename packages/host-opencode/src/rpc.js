/**
 * The OpenCode RPC contract. It is plain JavaScript so the server entry can
 * import it at runtime without pulling in `@opencode/plugin`.
 */
const define = (definition) => definition

export const Api = define({
  id: "await-arcade.api",
  methods: {
    start: {
      input: {
        type: "object",
        properties: {
          gameId: { type: "string" },
          modeId: { type: "string" },
        },
        required: ["gameId", "modeId"],
        additionalProperties: false,
      },
      output: { type: "object", additionalProperties: true },
    },
    submit: {
      input: {
        type: "object",
        properties: {
          runId: { type: "string" },
          replay: { type: "object" },
        },
        required: ["runId", "replay"],
        additionalProperties: true,
      },
      output: { type: "object", additionalProperties: true },
    },
    best: {
      input: {
        type: "object",
        properties: {
          gameId: { type: "string" },
          modeId: { type: "string" },
        },
        required: ["gameId", "modeId"],
        additionalProperties: false,
      },
      output: { type: "object", additionalProperties: true },
    },
    board: {
      input: {
        type: "object",
        properties: {
          gameId: { type: "string" },
          modeId: { type: "string" },
        },
        required: ["gameId", "modeId"],
        additionalProperties: false,
      },
      output: { type: "object", additionalProperties: true },
    },
    status: {
      output: { type: "object", additionalProperties: true },
    },
    authStatus: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
    authStart: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
    authPoll: {
      input: {
        type: "object",
        properties: {
          flowId: { type: "string" },
        },
        required: ["flowId"],
        additionalProperties: false,
      },
      output: { type: "object", additionalProperties: true },
    },
    authSignOut: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
    deleteAccount: {
      input: { type: "object", properties: {}, additionalProperties: false },
      output: { type: "object", additionalProperties: true },
    },
  },
  // Core reads `definition.events` unconditionally.
  events: {},
})
