import type { Plugin } from "@opencode-ai/plugin"
import { rewriteMessageParts } from "../lib/image-downscale"

export const ImageDownscalePlugin: Plugin = async () => {
  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      for (const message of output.messages) {
        message.parts = await rewriteMessageParts(message.parts)
      }
    },
  }
}

export default ImageDownscalePlugin
