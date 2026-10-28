"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { DecisionStage } from "@/lib/decision-stages";

type IssueStageState = { stage: DecisionStage; setStage: (stage: DecisionStage) => void };

const IssueStageContext = createContext<IssueStageState | null>(null);

/**
 * The stage picked in the progress report (#1446). It opens on the issue's
 * current stage, and the Agent decisions and Conversation cards follow it.
 */
export function IssueStageProvider({ initialStage, children }: { initialStage: DecisionStage; children: ReactNode }) {
  const [stage, setStage] = useState<DecisionStage>(initialStage);
  return <IssueStageContext.Provider value={{ stage, setStage }}>{children}</IssueStageContext.Provider>;
}

/** Null outside a provider, so the cards still work unfiltered elsewhere. */
export function useIssueStage(): IssueStageState | null {
  return useContext(IssueStageContext);
}
