import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRunPlatformSweeps = vi.hoisted(() => vi.fn());
const mockIsAgentPlatformEnabled = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cron/runner", () => ({ runPlatformSweeps: mockRunPlatformSweeps }));
vi.mock("@/lib/feature-flags", () => ({ isAgentPlatformEnabled: mockIsAgentPlatformEnabled }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import {
  shouldRunInProcessCron,
  startPlatformCron,
  stopPlatformCron,
} from "./scheduler";

describe("in-process platform cron scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockIsAgentPlatformEnabled.mockReturnValue(true);
    mockRunPlatformSweeps.mockResolvedValue({
      timestamp: "2026-10-27T12:00:00.000Z",
      sweeps: {
        bids: { status: "ok", invited: 1, assigned: 0, lapsed: 0 },
      },
    });
  });

  afterEach(() => {
    stopPlatformCron();
    vi.useRealTimers();
  });

  describe("shouldRunInProcessCron", () => {
    it("returns false during production build phase", () => {
      expect(
        shouldRunInProcessCron({
          NODE_ENV: "production",
          NEXT_PHASE: "phase-production-build",
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    });

    it("returns false when agent platform is disabled", () => {
      mockIsAgentPlatformEnabled.mockReturnValue(false);
      expect(
        shouldRunInProcessCron({
          NODE_ENV: "production",
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    });

    it("returns false when ENABLE_IN_PROCESS_CRON is explicitly false or 0", () => {
      expect(
        shouldRunInProcessCron({
          NODE_ENV: "production",
          ENABLE_IN_PROCESS_CRON: "false",
        } as NodeJS.ProcessEnv),
      ).toBe(false);

      expect(
        shouldRunInProcessCron({
          NODE_ENV: "production",
          ENABLE_IN_PROCESS_CRON: "0",
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    });

    it("returns true in production by default", () => {
      expect(
        shouldRunInProcessCron({
          NODE_ENV: "production",
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    });

    it("returns true when explicitly enabled in development", () => {
      expect(
        shouldRunInProcessCron({
          NODE_ENV: "development",
          ENABLE_IN_PROCESS_CRON: "true",
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    });

    it("returns false in development by default", () => {
      expect(
        shouldRunInProcessCron({
          NODE_ENV: "development",
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    });
  });

  describe("startPlatformCron and periodic sweeps", () => {
    it("executes initial sweep after initialDelayMs and periodically every intervalMs", async () => {
      startPlatformCron({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        initialDelayMs: 1000,
        intervalMs: 5000,
      });

      expect(mockRunPlatformSweeps).not.toHaveBeenCalled();

      // Advance to initial delay
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockRunPlatformSweeps).toHaveBeenCalledTimes(1);

      // Advance to first periodic interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockRunPlatformSweeps).toHaveBeenCalledTimes(2);

      // Advance to second periodic interval
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockRunPlatformSweeps).toHaveBeenCalledTimes(3);
    });

    it("is idempotent: multiple calls to startPlatformCron do not register duplicate intervals", async () => {
      startPlatformCron({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        initialDelayMs: 1000,
        intervalMs: 5000,
      });
      startPlatformCron({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        initialDelayMs: 1000,
        intervalMs: 5000,
      });

      await vi.advanceTimersByTimeAsync(1000);
      expect(mockRunPlatformSweeps).toHaveBeenCalledTimes(1);
    });

    it("stops all scheduled sweeps when stopPlatformCron is called", async () => {
      startPlatformCron({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        initialDelayMs: 1000,
        intervalMs: 5000,
      });

      stopPlatformCron();

      await vi.advanceTimersByTimeAsync(10000);
      expect(mockRunPlatformSweeps).not.toHaveBeenCalled();
    });

    it("handles sweep errors gracefully without stopping subsequent cycles", async () => {
      mockRunPlatformSweeps
        .mockRejectedValueOnce(new Error("Database connection lost"))
        .mockResolvedValueOnce({
          timestamp: "2026-10-27T12:01:00.000Z",
          sweeps: { bids: { status: "ok" } },
        });

      startPlatformCron({
        env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
        initialDelayMs: 1000,
        intervalMs: 5000,
      });

      // First run fails
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockRunPlatformSweeps).toHaveBeenCalledTimes(1);

      // Second run succeeds
      await vi.advanceTimersByTimeAsync(5000);
      expect(mockRunPlatformSweeps).toHaveBeenCalledTimes(2);
    });
  });
});
