import { describe, expect, it } from "vitest";
import { agentKindToSkillSource, availableSkillsForKind, type SkillSummary } from "./skills";

describe("agentKindToSkillSource", () => {
  it("maps claude-code to the claude skill source", () => {
    expect(agentKindToSkillSource("claude-code")).toBe("claude");
  });

  it("maps codex to the codex skill source", () => {
    expect(agentKindToSkillSource("codex")).toBe("codex");
  });
});

describe("availableSkillsForKind", () => {
  const skill = (id: string, source: SkillSummary["source"]): SkillSummary => ({
    id,
    name: id,
    description: "",
    tags: [],
    source,
  });
  const available: SkillSummary[] = [
    skill("a", "claude"),
    skill("b", "codex"),
    skill("c", "claude"),
  ];

  it("returns only the agent's own unmanaged skills", () => {
    expect(availableSkillsForKind(available, "claude-code").map((s) => s.id)).toEqual(["a", "c"]);
    expect(availableSkillsForKind(available, "codex").map((s) => s.id)).toEqual(["b"]);
  });
});
