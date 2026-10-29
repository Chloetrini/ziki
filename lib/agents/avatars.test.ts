import { describe, expect, it } from "vitest";
import { AGENT_AVATARS, avatarLook, isAgentAvatar } from "./avatars";

describe("agent avatars", () => {
  it("offers a dozen distinct robots, each with a unique key", () => {
    expect(AGENT_AVATARS).toHaveLength(12);
    expect(new Set(AGENT_AVATARS.map((avatar) => avatar.key)).size).toBe(12);
    expect(new Set(AGENT_AVATARS.map((avatar) => JSON.stringify(avatar.look))).size).toBe(12);
  });

  it("accepts only its own keys", () => {
    expect(isAgentAvatar("sky")).toBe(true);
    expect(isAgentAvatar("Sky")).toBe(false);
    expect(isAgentAvatar("<script>")).toBe(false);
    expect(isAgentAvatar(null)).toBe(false);
  });

  it("looks up a pick's features, and nothing for an unknown or missing pick", () => {
    expect(avatarLook("mint")).toEqual(AGENT_AVATARS[1].look);
    expect(avatarLook("gone")).toBeNull();
    expect(avatarLook(null)).toBeNull();
  });
});
