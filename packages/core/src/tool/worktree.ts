/**
 * Built-in worktree tools: create, list, and remove Git worktrees for the
 * active Location's project checkout.
 */
export * as WorktreeTool from "./worktree"

import path from "path"
import { ToolFailure } from "@opencode-ai/llm"
import { Effect, Layer, Schema } from "effect"
import { AbsolutePath } from "../schema"
import { makeLocationNode } from "../effect/app-node"
import { Git } from "../git"
import { Location } from "../location"
import { LocationMutation } from "../location-mutation"
import { PermissionV2 } from "../permission"
import { ToolRegistry } from "./registry"
import { Tool } from "./tool"
import { Tools } from "./tools"

export const CreateInput = Schema.Struct({
  name: Schema.String.annotate({ description: "Worktree name. Used as the directory name under .opencode/worktrees." }),
})

export const CreateOutput = Schema.Struct({
  directory: Schema.String,
})

export const ListOutput = Schema.Struct({
  worktrees: Schema.Array(
    Schema.Struct({
      directory: Schema.String,
      kind: Schema.Literals(["main", "linked"]),
    }),
  ),
})

export const RemoveInput = Schema.Struct({
  directory: Schema.String.annotate({ description: "Absolute path of the worktree to remove." }),
  force: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Discard modified and untracked files. Only set this when the user has confirmed forced removal.",
  }),
})

export const RemoveOutput = Schema.Struct({
  directory: Schema.String,
  removed: Schema.Boolean,
})

const sanitizeName = (name: string) =>
  name
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+/, "")
    .slice(0, 64)

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const tools = yield* Tools.Service
    const git = yield* Git.Service
    const location = yield* Location.Service
    const mutation = yield* LocationMutation.Service
    const permission = yield* PermissionV2.Service

    const repository = Effect.fn("WorktreeTool.repository")(function* () {
      const discovered = yield* git.repo.discover(AbsolutePath.make(location.project.directory))
      if (!discovered) return yield* new ToolFailure({ message: "Active project is not a Git repository" })
      return discovered
    })

    yield* tools
      .register({
        worktree_create: Tool.make({
          description: "Create a named Git worktree under .opencode/worktrees and return its directory.",
          input: CreateInput,
          output: CreateOutput,
          toModelOutput: ({ output }) => [{ type: "text", text: `Created worktree in ${output.directory}.` }],
          execute: (input) =>
            Effect.gen(function* () {
              const name = sanitizeName(input.name)
              if (!name) return yield* new ToolFailure({ message: "Worktree name is empty after sanitization" })
              const repo = yield* repository()
              const directory = AbsolutePath.make(path.join(location.project.directory, ".opencode", "worktrees", name))
              yield* git.worktree.create({ repository: repo, directory }).pipe(
                Effect.mapError(
                  (error) => new ToolFailure({ message: `Unable to create worktree ${name}: ${error.message}` }),
                ),
              )
              return { directory: directory as string }
            }),
        }),
        worktree_list: Tool.make({
          description: "List Git worktrees for the active project repository.",
          input: Schema.Struct({}),
          output: ListOutput,
          toModelOutput: ({ output }) => [
            {
              type: "text",
              text:
                output.worktrees.length === 0
                  ? "No worktrees found."
                  : output.worktrees.map((item) => `${item.kind}: ${item.directory}`).join("\n"),
            },
          ],
          execute: () =>
            Effect.gen(function* () {
              const repo = yield* repository()
              const worktrees = yield* git.worktree.list(repo).pipe(
                Effect.mapError((error) => new ToolFailure({ message: `Unable to list worktrees: ${error.message}` })),
              )
              return {
                worktrees: worktrees.map((item) => ({
                  directory: item.directory as string,
                  kind: item.kind,
                })),
              }
            }),
        }),
        worktree_remove: Tool.withPermission(
          Tool.make({
            description:
              "Remove a Git worktree. Requires edit approval because removal deletes files. Use force only after the user confirms discarding local changes.",
            input: RemoveInput,
            output: RemoveOutput,
            toModelOutput: ({ output }) => [{ type: "text", text: `Removed worktree ${output.directory}.` }],
            execute: (input, context) =>
              Effect.gen(function* () {
                const source = {
                  type: "tool" as const,
                  messageID: context.assistantMessageID,
                  callID: context.toolCallID,
                }
                const target = yield* mutation.resolve({ path: input.directory, kind: "directory" })
                yield* permission.assert({
                  action: "edit",
                  resources: [target.resource],
                  save: ["*"],
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
                const repo = yield* repository()
                if (target.canonical === (repo.worktree as string))
                  return yield* new ToolFailure({ message: "Refusing to remove the project checkout worktree" })
                yield* git.worktree
                  .remove({
                    repository: repo,
                    directory: AbsolutePath.make(target.canonical),
                    force: input.force ?? false,
                  })
                  .pipe(
                    Effect.mapError(
                      (error) =>
                        new ToolFailure({
                          message: error.forceRequired
                            ? `Worktree ${target.canonical} has local changes; pass force: true after user confirmation`
                            : `Unable to remove worktree ${target.canonical}: ${error.message}`,
                        }),
                    ),
                  )
                return { directory: target.canonical, removed: true }
              }).pipe(
                Effect.mapError((error) =>
                  error instanceof ToolFailure
                    ? error
                    : new ToolFailure({
                        message: `Unable to remove worktree ${input.directory}`,
                        error,
                      }),
                ),
              ),
          }),
          "edit",
        ),
      })
      .pipe(Effect.orDie)
  }),
)

export const node = makeLocationNode({
  name: "tool/worktree",
  layer,
  deps: [ToolRegistry.node, Git.node, Location.node, LocationMutation.node, PermissionV2.node],
})
