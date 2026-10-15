import type { AgentEvent } from "../llm/runtime";
import type { CutadError } from "../llm/errors";

export interface StreamSink {
  markdown(value: string): void;
  progress(value: string): void;
  button(command: { command: string; title: string }): void;
}

export interface RenderState {
  inReasoning: boolean;
  sawReasoning: boolean;
  textStarted: boolean;
  reasoningLineStart: boolean;
}

export function newRenderState(): RenderState {
  return { inReasoning: false, sawReasoning: false, textStarted: false, reasoningLineStart: true };
}

export function renderEvent(
  event: AgentEvent,
  sink: StreamSink,
  state: RenderState,
  showReasoning: boolean,
): void {
  switch (event.type) {
    case "text-delta":
      if (state.inReasoning) {
        sink.markdown("\n\n");
        state.inReasoning = false;
      }
      if (!state.textStarted) state.textStarted = true;
      sink.markdown(event.text);
      break;

    case "reasoning-delta": {
      if (!showReasoning) break;
      if (!state.inReasoning) {
        sink.markdown("> **Thinking…**\n>\n");
        state.inReasoning = true;
        state.sawReasoning = true;
        state.reasoningLineStart = true;
      }
      const text = event.text;
      if (!text) break;
      const prefixed = (state.reasoningLineStart ? "> " : "") + text.replaceAll("\n", "\n> ");
      state.reasoningLineStart = text.endsWith("\n");
      sink.markdown(prefixed);
      break;
    }

    case "reasoning-end":
      if (state.inReasoning) {
        sink.markdown("\n\n");
        state.inReasoning = false;
      }
      break;

    case "progress":
      sink.progress(event.text);
      break;

    case "tool-start":
      sink.progress(`⚙ ${event.toolId}: ${event.input}`);
      break;

    case "tool-end":
      sink.progress(`${event.ok ? "✓" : "✗"} ${event.toolId}${event.ok ? "" : ` — ${event.preview.slice(0, 120)}`}`);
      break;

    case "usage":
      break;

    case "rate-limit":
      break;

    case "error":
      if (state.inReasoning) {
        sink.markdown("\n\n");
        state.inReasoning = false;
      }
      sink.markdown("\n\n");
      sink.markdown(renderError(event.error));
      break;

    case "done":
      if (state.inReasoning) {
        sink.markdown("\n\n");
        state.inReasoning = false;
      }
      if (event.finishReason === "canceled") sink.markdown("\n\n_(canceled)_");
      break;
  }
}

export function renderError(error: CutadError): string {
  const lines = [`**⚠ ${error.title}**`, "", error.detail];
  return lines.join("\n");
}

export function errorAction(error: CutadError): { command: string; title: string } | undefined {
  if (!error.action) return undefined;
  return { command: error.action.command, title: error.action.label };
}
