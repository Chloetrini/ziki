// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AgentAvatar, agentLook } from "./agent-avatar";

afterEach(() => cleanup());

describe("AgentAvatar", () => {
  it("gives an agent the same face every time", () => {
    expect(agentLook("agent_1")).toEqual(agentLook("agent_1"));
  });

  it("gives different agents different faces", () => {
    const looks = new Set(
      Array.from({ length: 40 }, (_, index) => JSON.stringify(agentLook(`agent_${index}`))),
    );
    expect(looks.size).toBeGreaterThan(20);
  });

  it("renders a decorative face at the size asked for", () => {
    render(<AgentAvatar agentId="agent_1" size={56} />);
    const avatar = screen.getByTestId("agent-avatar");
    expect(avatar.getAttribute("aria-hidden")).toBe("true");
    expect(avatar.getAttribute("width")).toBe("56");
  });
});
