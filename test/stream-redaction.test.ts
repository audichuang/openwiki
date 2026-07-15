import { describe, expect, test } from "vitest";
import { extractContentBlockText } from "../src/agent/index.ts";

// extractContentBlockText turns one streamed content block into the text that
// reaches the terminal. file/image blocks carry base64 payloads that must be
// suppressed (upstream #215) rather than leaked through the generic
// content/output_text fallthrough below.
const extract = (block: unknown) => extractContentBlockText(block, new Set());

describe("extractContentBlockText content-block filtering", () => {
  test("plain text blocks pass through", () => {
    expect(extract({ type: "text", text: "Hello from the agent." })).toBe(
      "Hello from the agent.",
    );
    expect(extract("bare string")).toBe("bare string");
  });

  test("file / image blocks are suppressed (would otherwise leak base64)", () => {
    const base64 = "ZmYtZmFrZS1iYXNlNjQ=".repeat(250);

    // Without the file/image guard these hit the `content` key fallthrough and
    // return the raw blob.
    expect(extract({ type: "file", content: base64 })).toBe("");
    expect(extract({ type: "image", content: base64 })).toBe("");
    expect(extract({ type: "input_file", content: base64 })).toBe("");
    expect(
      extract({ type: "image_url", content: "data:image/png;base64,ab" }),
    ).toBe("");
  });

  test("tool / reasoning blocks stay suppressed (pre-existing behavior)", () => {
    expect(extract({ type: "tool_use", content: "x" })).toBe("");
    expect(extract({ type: "reasoning", text: "thinking" })).toBe("");
  });
});
